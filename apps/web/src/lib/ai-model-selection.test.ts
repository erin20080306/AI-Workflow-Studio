import { describe, expect, it } from 'vitest';

import { AiModelSelectionSchema, buildAiTierOptions } from './ai-model-selection';

describe('AI model selection', () => {
  it('keeps client choices provider-neutral and tier based', () => {
    expect(AiModelSelectionSchema.parse({ provider: 'auto', tier: 'economy' })).toEqual({
      provider: 'auto',
      tier: 'economy',
    });
    expect(
      buildAiTierOptions('free')
        .filter((tier) => tier.enabled)
        .map((tier) => tier.id),
    ).toEqual(['economy']);
    expect(
      buildAiTierOptions('business')
        .filter((tier) => tier.enabled)
        .map((tier) => tier.id),
    ).toEqual(['economy', 'standard', 'advanced', 'flagship']);
  });
});
