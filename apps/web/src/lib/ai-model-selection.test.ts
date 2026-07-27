import { describe, expect, it } from 'vitest';

import { DEFAULT_AI_MODEL_MAPPINGS } from './ai-model-catalog';
import { AiModelSelectionSchema, buildAiTierOptions } from './ai-model-selection';

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
