import type { PlanCode } from '@ai-workflow-studio/shared/plans';
import {
  AiModelTierSchema,
  AiModelTierSelectionSchema,
  allowedAiModelTiers,
  type AiModelTier,
  type AiModelTierSelection,
} from '@ai-workflow-studio/usage-control';
import { z } from 'zod';

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
}

const tierLabels: Readonly<Record<AiModelTier, { readonly en: string; readonly zhHant: string }>> =
  {
    advanced: { en: 'Advanced', zhHant: '進階' },
    economy: { en: 'Economy', zhHant: '經濟' },
    flagship: { en: 'Flagship', zhHant: '旗艦' },
    standard: { en: 'Standard', zhHant: '標準' },
  };

export function buildAiTierOptions(plan: PlanCode): readonly AiTierOption[] {
  const allowed = new Set(allowedAiModelTiers(plan));
  return AiModelTierSchema.options.map((tier) => ({
    enabled: allowed.has(tier),
    id: tier,
    label: tierLabels[tier],
  }));
}

export type { AiModelTier, AiModelTierSelection };
