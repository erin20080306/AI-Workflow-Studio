import type { FetchTransport } from '@ai-workflow-studio/ai-gateway';
import { z } from 'zod';

import type { ProductionAiProvider } from '@/lib/ai-model-catalog';

const PROVIDER_HEALTH_TIMEOUT_MS = 5_000;
const MAX_MODEL_LIST_BYTES = 2_000_000;

const ProviderModelListSchema = z
  .object({
    data: z.array(z.object({ id: z.string().min(1).max(200) }).passthrough()).max(10_000),
  })
  .passthrough();
const GeminiModelListSchema = z
  .object({
    models: z
      .array(
        z
          .object({
            name: z.string().min(1).max(240),
            supportedGenerationMethods: z.array(z.string()).max(40).optional(),
          })
          .passthrough(),
      )
      .max(10_000),
  })
  .passthrough();

export const AiProviderHealthStatusSchema = z.enum([
  'authentication_failed',
  'available',
  'not_configured',
  'rate_limited',
  'unreachable',
]);
export type AiProviderHealthStatus = z.infer<typeof AiProviderHealthStatusSchema>;

export interface AiProviderHealth {
  readonly checkedAt: string;
  readonly models: readonly string[];
  readonly provider: ProductionAiProvider;
  readonly status: AiProviderHealthStatus;
}

function requestForProvider(
  provider: ProductionAiProvider,
  apiKey: string,
): { readonly headers: Readonly<Record<string, string>>; readonly url: string } {
  if (provider === 'openai') {
    return {
      headers: { authorization: `Bearer ${apiKey}` },
      url: 'https://api.openai.com/v1/models',
    };
  }
  if (provider === 'anthropic') {
    return {
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      url: 'https://api.anthropic.com/v1/models?limit=1000',
    };
  }
  return {
    headers: { 'x-goog-api-key': apiKey },
    url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
  };
}

function healthStatusForHttp(status: number): AiProviderHealthStatus {
  if (status === 401 || status === 403) return 'authentication_failed';
  if (status === 429) return 'rate_limited';
  return 'unreachable';
}

function parseModels(
  provider: ProductionAiProvider,
  payload: unknown,
): readonly string[] | undefined {
  if (provider !== 'gemini') {
    const parsed = ProviderModelListSchema.safeParse(payload);
    return parsed.success
      ? [...new Set(parsed.data.data.map((model) => model.id))].sort()
      : undefined;
  }

  const parsed = GeminiModelListSchema.safeParse(payload);
  if (!parsed.success) return undefined;
  return [
    ...new Set(
      parsed.data.models
        .filter(
          (model) =>
            model.supportedGenerationMethods === undefined ||
            model.supportedGenerationMethods.includes('generateContent'),
        )
        .map((model) => model.name.replace(/^models\//, '')),
    ),
  ].sort();
}

export async function probeAiProvider(
  provider: ProductionAiProvider,
  apiKey: string,
  fetchTransport: FetchTransport = globalThis.fetch,
): Promise<AiProviderHealth> {
  const checkedAt = new Date().toISOString();
  const request = requestForProvider(provider, apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort('provider_health_timeout'),
    PROVIDER_HEALTH_TIMEOUT_MS,
  );

  try {
    const response = await fetchTransport(request.url, {
      headers: {
        accept: 'application/json',
        ...request.headers,
      },
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        checkedAt,
        models: [],
        provider,
        status: healthStatusForHttp(response.status),
      };
    }

    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_MODEL_LIST_BYTES) {
      return { checkedAt, models: [], provider, status: 'unreachable' };
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      return { checkedAt, models: [], provider, status: 'unreachable' };
    }
    const models = parseModels(provider, payload);
    return models === undefined
      ? { checkedAt, models: [], provider, status: 'unreachable' }
      : { checkedAt, models, provider, status: 'available' };
  } catch {
    return { checkedAt, models: [], provider, status: 'unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}
