import 'server-only';

import { z } from 'zod';

import { ProductionAiProviderSchema, type ProductionAiProvider } from '@/lib/ai-model-catalog';
import {
  probeAiProvider,
  type AiProviderHealth,
  type AiProviderHealthStatus,
} from '@/lib/ai-provider-health-probe';

const PROVIDER_HEALTH_TTL_MS = 5 * 60 * 1_000;

interface CachedProviderHealth {
  readonly expiresAt: number;
  readonly value: AiProviderHealth;
}

const healthCache = new Map<ProductionAiProvider, CachedProviderHealth>();

function providerSecret(provider: ProductionAiProvider): string | undefined {
  const value =
    provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : provider === 'anthropic'
        ? process.env.ANTHROPIC_API_KEY
        : process.env.GEMINI_API_KEY;
  return z.string().min(24).safeParse(value).success ? value : undefined;
}

export async function getAiProviderHealth(
  provider: ProductionAiProvider,
  options: { readonly force?: boolean } = {},
): Promise<AiProviderHealth> {
  const cached = healthCache.get(provider);
  if (options.force !== true && cached !== undefined && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const apiKey = providerSecret(provider);
  const value =
    apiKey === undefined
      ? {
          checkedAt: new Date().toISOString(),
          models: [],
          provider,
          status: 'not_configured' as const,
        }
      : await probeAiProvider(provider, apiKey);
  healthCache.set(provider, {
    expiresAt: Date.now() + PROVIDER_HEALTH_TTL_MS,
    value,
  });
  return value;
}

export async function listAiProviderHealth(): Promise<readonly AiProviderHealth[]> {
  return Promise.all(
    ProductionAiProviderSchema.options.map((provider) => getAiProviderHealth(provider)),
  );
}

export type { AiProviderHealth, AiProviderHealthStatus };
