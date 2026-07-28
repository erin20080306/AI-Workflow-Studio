import type { AiModelTier } from '@ai-workflow-studio/shared/plans';
import { z } from 'zod';

export const ProductionAiProviderSchema = z.enum(['anthropic', 'gemini', 'openai']);
export type ProductionAiProvider = z.infer<typeof ProductionAiProviderSchema>;
export type OpenAiReasoningEffort = 'high' | 'low' | 'medium';

export interface AiModelMapping {
  readonly costMultiplier: number;
  readonly enabled: boolean;
  readonly model: string;
  readonly provider: ProductionAiProvider;
  readonly reasoningEffort?: OpenAiReasoningEffort;
  readonly tier: AiModelTier;
}

export const DEFAULT_AI_MODEL_MAPPINGS: readonly AiModelMapping[] = [
  {
    costMultiplier: 1,
    enabled: true,
    model: 'gpt-5.6-luna',
    provider: 'openai',
    reasoningEffort: 'low',
    tier: 'economy',
  },
  {
    costMultiplier: 3,
    enabled: true,
    model: 'gpt-5.6-terra',
    provider: 'openai',
    reasoningEffort: 'medium',
    tier: 'standard',
  },
  {
    costMultiplier: 8,
    enabled: true,
    model: 'gpt-5.6-sol',
    provider: 'openai',
    reasoningEffort: 'medium',
    tier: 'advanced',
  },
  {
    costMultiplier: 12,
    enabled: true,
    model: 'gpt-5.6-sol',
    provider: 'openai',
    reasoningEffort: 'high',
    tier: 'flagship',
  },
  {
    costMultiplier: 1,
    enabled: true,
    model: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    tier: 'economy',
  },
  {
    costMultiplier: 2,
    enabled: true,
    model: 'claude-sonnet-5',
    provider: 'anthropic',
    tier: 'standard',
  },
  {
    costMultiplier: 5,
    enabled: true,
    model: 'claude-opus-4-8',
    provider: 'anthropic',
    tier: 'advanced',
  },
  {
    costMultiplier: 10,
    enabled: true,
    model: 'claude-fable-5',
    provider: 'anthropic',
    tier: 'flagship',
  },
  {
    costMultiplier: 1,
    enabled: true,
    model: 'gemini-3.5-flash-lite',
    provider: 'gemini',
    tier: 'economy',
  },
  {
    costMultiplier: 4,
    enabled: true,
    model: 'gemini-3.6-flash',
    provider: 'gemini',
    tier: 'standard',
  },
  {
    costMultiplier: 4.5,
    enabled: true,
    model: 'gemini-3.5-flash',
    provider: 'gemini',
    tier: 'advanced',
  },
  {
    costMultiplier: 6,
    enabled: true,
    model: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    tier: 'flagship',
  },
];

export const ALLOWED_AI_MODELS_BY_TIER: Readonly<
  Record<ProductionAiProvider, Readonly<Record<AiModelTier, readonly string[]>>>
> = {
  anthropic: {
    advanced: ['claude-opus-4-8'],
    economy: ['claude-haiku-4-5-20251001'],
    flagship: ['claude-fable-5'],
    standard: ['claude-sonnet-5'],
  },
  gemini: {
    advanced: ['gemini-3.5-flash'],
    economy: ['gemini-3.5-flash-lite'],
    flagship: ['gemini-3.1-pro-preview'],
    standard: ['gemini-3.6-flash'],
  },
  openai: {
    advanced: ['gpt-5.6-sol'],
    economy: ['gpt-5.6-luna'],
    flagship: ['gpt-5.6-sol'],
    standard: ['gpt-5.6-terra'],
  },
};

const NON_TEXT_MODEL_MARKERS = [
  'audio',
  'chat-latest',
  'codex',
  'computer-use',
  'deep-research',
  'embedding',
  'imagen',
  'image',
  'live',
  'moderation',
  'realtime',
  'robotics',
  'search',
  'transcribe',
  'translation',
  'tts',
] as const;

function isTextModelName(model: string): boolean {
  const normalized = model.toLowerCase();
  return !NON_TEXT_MODEL_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * Accepts account-listed text model IDs only when their product role matches
 * the requested cost tier. The provider model-list response remains the source
 * of truth; this classifier prevents a valid key from routing to unrelated
 * image, audio, embedding, or higher-cost model families.
 */
export function isAccountModelCompatibleWithTier(
  provider: ProductionAiProvider,
  tier: AiModelTier,
  model: string,
): boolean {
  if (!/^[A-Za-z0-9._:-]{2,120}$/.test(model) || !isTextModelName(model)) return false;
  const normalized = model.toLowerCase();

  if (provider === 'openai') {
    if (!/^gpt-[a-z0-9.-]+$/.test(normalized)) return false;
    const economy = /-(?:luna|mini|nano)(?:-|$)/.test(normalized);
    const standard = /-(?:terra|mini)(?:-|$)/.test(normalized);
    const sol = /-sol(?:-|$)/.test(normalized);
    if (tier === 'economy') return economy;
    if (tier === 'standard') return standard;
    if (tier === 'flagship') return sol;
    return sol || (!economy && !standard && /^gpt-(?:4\.1|5(?:[.-]\d+)?)(?:-|$)/.test(normalized));
  }

  if (provider === 'anthropic') {
    if (!/^claude-(?:fable|haiku|opus|sonnet)-[a-z0-9-]+$/.test(normalized)) return false;
    if (tier === 'economy') return normalized.startsWith('claude-haiku-');
    if (tier === 'standard') return normalized.startsWith('claude-sonnet-');
    if (tier === 'advanced') return normalized.startsWith('claude-opus-');
    return normalized.startsWith('claude-fable-') || normalized.startsWith('claude-opus-');
  }

  if (!/^gemini-[a-z0-9.-]+$/.test(normalized)) return false;
  const flashLite = normalized.includes('flash-lite');
  const flash = normalized.includes('flash');
  const pro = normalized.includes('pro');
  if (tier === 'economy') return flashLite;
  if (tier === 'standard') return flash && !flashLite;
  if (tier === 'advanced') return (flash && !flashLite) || pro;
  return pro;
}

function stableModelRank(model: string): number {
  return /(?:^|[-.])(?:exp|experimental|latest|preview)(?:[-.]|$)/i.test(model) ? 0 : 1;
}

export function listAccountModelsForTier(
  provider: ProductionAiProvider,
  tier: AiModelTier,
  models: readonly string[],
): readonly string[] {
  return [...new Set(models)]
    .filter((model) => isAccountModelCompatibleWithTier(provider, tier, model))
    .sort((left, right) => {
      const stability = stableModelRank(right) - stableModelRank(left);
      return stability === 0
        ? right.localeCompare(left, 'en', { numeric: true, sensitivity: 'base' })
        : stability;
    });
}

function preferredModelPrefixes(preferred: string): readonly string[] {
  const withoutDate = preferred.replace(/-\d{8}$/, '');
  return withoutDate === preferred ? [`${preferred}-`] : [`${preferred}-`, `${withoutDate}-`];
}

export function resolveAccountModelForTier(
  provider: ProductionAiProvider,
  tier: AiModelTier,
  preferred: string,
  accountModels: readonly string[],
): string | undefined {
  const candidates = listAccountModelsForTier(provider, tier, accountModels);
  if (candidates.includes(preferred)) return preferred;

  for (const prefix of preferredModelPrefixes(preferred)) {
    const versioned = candidates.find((candidate) => candidate.startsWith(prefix));
    if (versioned !== undefined) return versioned;
  }
  return candidates[0];
}
