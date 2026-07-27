import 'server-only';

import type { AiModelTier } from '@ai-workflow-studio/shared/plans';
import { z } from 'zod';

import type { ResolvedWebsiteImageRoute } from '@/lib/website-image-routing';

const MAX_PROVIDER_RESPONSE_BYTES = 12_000_000;
const MAX_IMAGE_BYTES = 8_000_000;
const IMAGE_TIMEOUT_MS = 55_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MOCK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const OpenAiImageResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            b64_json: z.string().min(1).max(11_000_000),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();

const GeminiImageResponseSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            content: z
              .object({
                parts: z
                  .array(
                    z
                      .object({
                        inlineData: z
                          .object({
                            data: z.string().min(1).max(11_000_000),
                            mimeType: z.string().min(1).max(80),
                          })
                          .optional(),
                      })
                      .passthrough(),
                  )
                  .max(20),
              })
              .passthrough(),
            finishReason: z.string().optional(),
          })
          .passthrough(),
      )
      .min(1)
      .max(4),
  })
  .passthrough();

export interface GeneratedWebsiteImage {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly mimeType: 'image/png';
  readonly model: string;
  readonly provider: 'gemini' | 'mock' | 'openai';
  readonly width: number;
}

export class WebsiteImageProviderError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WebsiteImageProviderError';
    this.status = status;
  }
}

export function validatePngImage(bytesValue: Uint8Array): {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly mimeType: 'image/png';
  readonly width: number;
} {
  const bytes = Buffer.from(bytesValue);
  if (
    bytes.byteLength < 33 ||
    bytes.byteLength > MAX_IMAGE_BYTES ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
    bytes.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    throw new WebsiteImageProviderError('The provider image did not pass PNG validation.');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 4_096 || height > 4_096) {
    throw new WebsiteImageProviderError('The provider image dimensions are outside safe limits.');
  }
  return { bytes, height, mimeType: 'image/png', width };
}

function providerKey(provider: 'gemini' | 'openai'): string {
  const key = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  if (key === undefined || key.length < 24) {
    throw new WebsiteImageProviderError('The selected image provider is not configured.');
  }
  return key;
}

function providerError(status: number): WebsiteImageProviderError {
  if (status === 401 || status === 403) {
    return new WebsiteImageProviderError(
      'The image provider credential could not be authenticated.',
      status,
    );
  }
  if (status === 429) {
    return new WebsiteImageProviderError('The image provider quota is temporarily exhausted.', 429);
  }
  return new WebsiteImageProviderError('The image provider request failed.', status);
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (
    !Number.isFinite(contentLength) ||
    contentLength < 0 ||
    contentLength > MAX_PROVIDER_RESPONSE_BYTES
  ) {
    throw new WebsiteImageProviderError('The image provider response was too large.');
  }
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new WebsiteImageProviderError('The image provider returned an empty response.');
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += chunk.value.byteLength;
    if (received > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel();
      throw new WebsiteImageProviderError('The image provider response was too large.');
    }
    chunks.push(chunk.value);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new WebsiteImageProviderError('The image provider returned invalid JSON.');
  }
}

async function postProviderJson(
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  fetchTransport: typeof fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('website_image_timeout'), IMAGE_TIMEOUT_MS);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetchTransport(url, { ...init, signal: controller.signal });
    if (!response.ok) throw providerError(response.status);
    return await readBoundedJson(response);
  } catch (error) {
    if (error instanceof WebsiteImageProviderError) throw error;
    throw new WebsiteImageProviderError('The image provider could not be reached.', undefined, {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function openAiQuality(tier: AiModelTier): 'high' | 'low' | 'medium' {
  if (tier === 'economy') return 'low';
  if (tier === 'standard') return 'medium';
  return 'high';
}

function geminiImageSize(tier: AiModelTier): '1K' | '2K' {
  return tier === 'advanced' || tier === 'flagship' ? '2K' : '1K';
}

function decodeBase64Image(value: string): ReturnType<typeof validatePngImage> {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new WebsiteImageProviderError('The image provider returned invalid base64 data.');
  }
  return validatePngImage(Buffer.from(value, 'base64'));
}

export async function generateWebsiteImage(
  route: ResolvedWebsiteImageRoute,
  prompt: string,
  options: {
    readonly fetchTransport?: typeof fetch;
    readonly signal?: AbortSignal;
  } = {},
): Promise<GeneratedWebsiteImage> {
  if (route.provider === 'mock') {
    return {
      ...validatePngImage(Buffer.from(MOCK_PNG_BASE64, 'base64')),
      model: route.model,
      provider: 'mock',
    };
  }
  const fetchTransport = options.fetchTransport ?? globalThis.fetch;
  const safePrompt = `Create one polished website visual with no watermark, no interface chrome, and no readable text. Preserve the user's visual intent: ${prompt}`;

  if (route.provider === 'openai') {
    const payload = await postProviderJson(
      'https://api.openai.com/v1/images/generations',
      {
        body: JSON.stringify({
          model: route.model,
          n: 1,
          output_format: 'png',
          prompt: safePrompt,
          quality: openAiQuality(route.tier),
          size: '1536x1024',
        }),
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${providerKey('openai')}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
      options.signal,
      fetchTransport,
    );
    const parsed = OpenAiImageResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new WebsiteImageProviderError('OpenAI returned an unexpected image response.');
    }
    return {
      ...decodeBase64Image(parsed.data.data[0]!.b64_json),
      model: route.model,
      provider: 'openai',
    };
  }

  const payload = await postProviderJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(route.model)}:generateContent`,
    {
      body: JSON.stringify({
        contents: [{ parts: [{ text: safePrompt }], role: 'user' }],
        generationConfig: {
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: geminiImageSize(route.tier),
          },
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-goog-api-key': providerKey('gemini'),
      },
      method: 'POST',
    },
    options.signal,
    fetchTransport,
  );
  const parsed = GeminiImageResponseSchema.safeParse(payload);
  const image = parsed.success
    ? parsed.data.candidates
        .flatMap((candidate) => candidate.content.parts)
        .map((part) => part.inlineData)
        .find((part) => part?.mimeType === 'image/png')
    : undefined;
  if (image === undefined) {
    throw new WebsiteImageProviderError('Gemini returned no validated PNG image.');
  }
  return {
    ...decodeBase64Image(image.data),
    model: route.model,
    provider: 'gemini',
  };
}
