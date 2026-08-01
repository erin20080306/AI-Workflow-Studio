import { describe, expect, it } from 'vitest';

import { DEFAULT_AI_MODEL_MAPPINGS } from './ai-model-catalog';
import type { AiTierOption } from './ai-model-selection';
import {
  AiModelSelectionSchema,
  buildAiTierOptions,
  modelsForSelectedProvider,
} from './ai-model-selection';

describe('AI model selection', () => {
  it('keeps client choices provider-neutral and tier based', () => {
    expect(AiModelSelectionSchema.parse({ provider: 'auto', tier: 'economy' })).toEqual({
      provider: 'auto',
      tier: 'economy',
    });
    expect(
      buildAiTierOptions('free', DEFAULT_AI_MODEL_MAPPINGS)
        .filter((tier) => tier.enabled)
        .map((tier) => tier.id),
    ).toEqual(['economy']);
    expect(
      buildAiTierOptions('business', DEFAULT_AI_MODEL_MAPPINGS)
        .filter((tier) => tier.enabled)
        .map((tier) => tier.id),
    ).toEqual(['economy', 'standard', 'advanced', 'flagship']);
    expect(buildAiTierOptions('free', DEFAULT_AI_MODEL_MAPPINGS)[0]?.models).toEqual([
      { model: 'gpt-5.6-luna', provider: 'openai', providerLabel: 'OpenAI' },
      {
        model: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
        providerLabel: 'Claude',
      },
      { model: 'gemini-3.5-flash-lite', provider: 'gemini', providerLabel: 'Gemini' },
    ]);
  });
});

const option: AiTierOption = {
  enabled: true,
  id: 'economy',
  label: { en: 'Economy', zhHant: '經濟' },
  models: [
    { model: 'openai-economy', provider: 'openai', providerLabel: 'OpenAI' },
    { model: 'claude-economy', provider: 'anthropic', providerLabel: 'Claude' },
    { model: 'gemini-economy', provider: 'gemini', providerLabel: 'Gemini' },
  ],
};

describe('modelsForSelectedProvider', () => {
  it('shows only the selected provider model inside a model level', () => {
    expect(modelsForSelectedProvider(option, 'openai')).toEqual([option.models[0]]);
    expect(modelsForSelectedProvider(option, 'anthropic')).toEqual([option.models[1]]);
    expect(modelsForSelectedProvider(option, 'gemini')).toEqual([option.models[2]]);
  });

  it('keeps all candidates only while automatic provider routing is selected', () => {
    expect(modelsForSelectedProvider(option, 'auto')).toEqual(option.models);
    expect(modelsForSelectedProvider(option, 'mock')).toEqual([]);
  });
});
