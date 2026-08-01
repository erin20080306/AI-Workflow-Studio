import type { PlanCode } from '@ai-workflow-studio/shared/plans';
import {
  AiModelTierSchema,
  AiModelTierSelectionSchema,
  allowedAiModelTiers,
  type AiModelTier,
  type AiModelTierSelection,
} from '@ai-workflow-studio/usage-control';
import { z } from 'zod';

import type { AiModelMapping, ProductionAiProvider } from '@/lib/ai-model-catalog';

export const AiProviderSelectionSchema = z.enum(['auto', 'anthropic', 'gemini', 'mock', 'openai']);
export type AiProviderSelection = z.infer<typeof AiProviderSelectionSchema>;

export const AiModelSelectionSchema = z
  .object({
    provider: AiProviderSelectionSchema,
    tier: AiModelTierSelectionSchema,
  })
  .strict();
export type AiModelSelection = z.infer<typeof AiModelSelectionSchema>;

export interface AiTierOption {
  readonly enabled: boolean;
  readonly id: AiModelTier;
  readonly label: {
    readonly en: string;
    readonly zhHant: string;
  };
  readonly models: readonly {
    readonly model: string;
    readonly provider: ProductionAiProvider;
    readonly providerLabel: string;
  }[];
}

const tierLabels: Readonly<Record<AiModelTier, { readonly en: string; readonly zhHant: string }>> =
  {
    advanced: { en: 'Advanced', zhHant: '進階' },
    economy: { en: 'Economy', zhHant: '經濟' },
    flagship: { en: 'Flagship', zhHant: '旗艦' },
    standard: { en: 'Standard', zhHant: '標準' },
  };

const providerLabels: Readonly<Record<ProductionAiProvider, string>> = {
  anthropic: 'Claude',
  gemini: 'Gemini',
  openai: 'OpenAI',
};
const providerOrder: Readonly<Record<ProductionAiProvider, number>> = {
  anthropic: 1,
  gemini: 2,
  openai: 0,
};

export function buildAiTierOptions(
  plan: PlanCode,
  mappings: readonly AiModelMapping[],
): readonly AiTierOption[] {
  const allowed = new Set(allowedAiModelTiers(plan));
  return AiModelTierSchema.options.map((tier) => ({
    enabled: allowed.has(tier),
    id: tier,
    label: tierLabels[tier],
    models: mappings
      .filter((mapping) => mapping.tier === tier && mapping.enabled)
      .sort((left, right) => providerOrder[left.provider] - providerOrder[right.provider])
      .map((mapping) => ({
        model: mapping.model,
        provider: mapping.provider,
        providerLabel: providerLabels[mapping.provider],
      })),
  }));
}

export function modelsForSelectedProvider(
  option: AiTierOption,
  provider: AiProviderSelection,
): AiTierOption['models'] {
  if (provider === 'auto') return option.models;
  if (provider === 'mock') return [];
  return option.models.filter((model) => model.provider === provider);
}

export type { AiModelTier, AiModelTierSelection };
