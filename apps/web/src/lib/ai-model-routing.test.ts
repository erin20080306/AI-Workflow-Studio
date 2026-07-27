import { describe, expect, it } from 'vitest';

import { ALLOWED_AI_MODELS_BY_TIER, DEFAULT_AI_MODEL_MAPPINGS } from './ai-model-catalog';

describe('server-only model mappings', () => {
  it('contains one allowlisted model for every production provider and level', () => {
    expect(DEFAULT_AI_MODEL_MAPPINGS).toHaveLength(12);
    expect(
      new Set(DEFAULT_AI_MODEL_MAPPINGS.map((mapping) => `${mapping.provider}:${mapping.tier}`))
        .size,
    ).toBe(12);
    for (const mapping of DEFAULT_AI_MODEL_MAPPINGS) {
      expect(ALLOWED_AI_MODELS_BY_TIER[mapping.provider][mapping.tier]).toContain(mapping.model);
      expect(mapping.costMultiplier).toBeGreaterThan(0);
    }
  });

  it('uses Gemini Flash-Lite as the lowest-cost free default', () => {
    expect(
      DEFAULT_AI_MODEL_MAPPINGS.find(
        (mapping) => mapping.provider === 'gemini' && mapping.tier === 'economy',
      )?.model,
    ).toBe('gemini-3.5-flash-lite');
  });
});
