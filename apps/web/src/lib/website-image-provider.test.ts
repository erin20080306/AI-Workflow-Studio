import type { ResolvedWebsiteImageRoute } from '@/lib/website-image-routing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  generateWebsiteImage,
  validatePngImage,
  WebsiteImageProviderError,
} from './website-image-provider';

vi.mock('server-only', () => ({}));

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const route = (
  provider: ResolvedWebsiteImageRoute['provider'],
  model: string,
): ResolvedWebsiteImageRoute => ({
  maximumCostMicrounits: provider === 'mock' ? 0 : 2_000_000,
  model,
  plan: 'free',
  provider,
  tier: 'economy',
});

const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalGeminiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiKey;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
});

describe('website image providers', () => {
  it('returns a deterministic validated PNG in mock mode', async () => {
    const image = await generateWebsiteImage(route('mock', 'mock-image-v1'), 'A safe visual');
    expect(image).toMatchObject({
      height: 1,
      mimeType: 'image/png',
      model: 'mock-image-v1',
      provider: 'mock',
      width: 1,
    });
    expect(image.bytes.byteLength).toBeGreaterThan(32);
  });

  it('calls OpenAI server-side and accepts only validated base64 PNG output', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-website-image-provider-key-1234567890';
    let requestBody = '';
    const fetchTransport: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ data: [{ b64_json: VALID_PNG_BASE64 }] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    };
    const image = await generateWebsiteImage(
      route('openai', 'gpt-image-2'),
      'A polished secure workflow illustration',
      { fetchTransport },
    );
    expect(image.provider).toBe('openai');
    expect(image.width).toBe(1);
    expect(requestBody).toContain('"model":"gpt-image-2"');
    expect(requestBody).toContain('"output_format":"png"');
  });

  it('extracts Gemini inline PNG data without accepting text-only responses', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test-website-image-provider-key-123456';
    const fetchTransport: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Generated image' },
                  { inlineData: { data: VALID_PNG_BASE64, mimeType: 'image/png' } },
                ],
              },
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    const image = await generateWebsiteImage(
      route('gemini', 'gemini-3.1-flash-lite-image'),
      'A polished safe website visual',
      { fetchTransport },
    );
    expect(image).toMatchObject({ height: 1, provider: 'gemini', width: 1 });

    await expect(
      generateWebsiteImage(
        route('gemini', 'gemini-3.1-flash-lite-image'),
        'A polished safe website visual',
        {
          fetchTransport: async () =>
            new Response(
              JSON.stringify({
                candidates: [{ content: { parts: [{ text: 'No image available' }] } }],
              }),
              { status: 200 },
            ),
        },
      ),
    ).rejects.toThrow('Gemini returned no validated PNG image.');
  });

  it('rejects invalid or oversized image payloads before storage', () => {
    expect(() => validatePngImage(new TextEncoder().encode('not an image'))).toThrow(
      WebsiteImageProviderError,
    );
    expect(() => validatePngImage(new Uint8Array(8_000_001))).toThrow(
      'did not pass PNG validation',
    );
  });
});
