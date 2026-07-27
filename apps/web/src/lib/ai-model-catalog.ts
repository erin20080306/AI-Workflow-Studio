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
