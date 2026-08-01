import { describe, expect, it } from 'vitest';

import {
  ALLOWED_AI_MODELS_BY_TIER,
  DEFAULT_AI_MODEL_MAPPINGS,
  isAccountModelCompatibleWithTier,
  listAccountModelsForTier,
  resolveAccountModelForTier,
} from './ai-model-catalog';
import { candidateRoutingTiers } from './ai-model-routing-policy';

describe('server-only model mappings', () => {
  it('lets Auto safely downgrade through lower-cost tiers while explicit levels stay exact', () => {
    expect(candidateRoutingTiers('auto', 'standard')).toEqual(['standard', 'economy']);
    expect(candidateRoutingTiers('auto', 'flagship')).toEqual([
      'flagship',
      'advanced',
      'standard',
      'economy',
    ]);
    expect(candidateRoutingTiers('standard', 'standard')).toEqual(['standard']);
  });
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

  it('resolves a preferred alias to the exact versioned model returned by the account', () => {
    expect(
      resolveAccountModelForTier('anthropic', 'standard', 'claude-sonnet-5', [
        'claude-opus-4-8-20260618',
        'claude-sonnet-5-20260712',
      ]),
    ).toBe('claude-sonnet-5-20260712');
    expect(
      resolveAccountModelForTier('openai', 'advanced', 'gpt-5.6-sol', [
        'gpt-5.6-sol-2026-07-15',
        'gpt-5.6-terra',
      ]),
    ).toBe('gpt-5.6-sol-2026-07-15');
  });

  it('keeps account discovery inside text-model and cost-tier boundaries', () => {
    expect(
      listAccountModelsForTier('gemini', 'economy', [
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite-image',
        'text-embedding-004',
      ]),
    ).toEqual(['gemini-3.5-flash-lite']);
    expect(isAccountModelCompatibleWithTier('anthropic', 'economy', 'claude-opus-4-8')).toBe(false);
    expect(isAccountModelCompatibleWithTier('openai', 'economy', 'gpt-5.3-codex')).toBe(false);
    expect(isAccountModelCompatibleWithTier('openai', 'economy', 'gpt-5-chat-latest')).toBe(false);
    expect(isAccountModelCompatibleWithTier('openai', 'standard', 'gpt-5.6-terra-20260728')).toBe(
      true,
    );
  });
});
