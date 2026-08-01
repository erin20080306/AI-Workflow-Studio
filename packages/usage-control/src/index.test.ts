import { describe, expect, it } from 'vitest';

import {
  canReserveUsage,
  allowedAiModelTiers,
  estimateAiCostMicrounits,
  estimateMaximumAiCostMicrounits,
  evaluateUsageBudget,
  getProductPlan,
  INTERNAL_RATE_CARD_VERSION,
  isAiModelTierAllowed,
  UsageOperationSchema,
} from './index';

describe('usage control', () => {
  it('uses a versioned conservative rate card without charging mock usage', () => {
    expect(INTERNAL_RATE_CARD_VERSION).toMatch(/^2026-07-/);
    expect(estimateAiCostMicrounits('mock', 100_000, 100_000)).toBe(0);
    expect(estimateAiCostMicrounits('openai', 1_000_000, 1_000_000)).toBe(260_000_000);
    expect(estimateAiCostMicrounits('openai', 1_000_000, 1_000_000, 0.5)).toBe(130_000_000);
    expect(
      estimateMaximumAiCostMicrounits({
        inputCharacters: 12_000,
        maxAttempts: 2,
        maxOutputTokens: 2_048,
        provider: 'anthropic',
      }),
    ).toBeGreaterThan(0);
  });

  it('reserves for the worst-case token density of CJK and structured input', () => {
    const characters = 12_000;
    expect(
      estimateMaximumAiCostMicrounits({
        inputCharacters: characters,
        maxOutputTokens: 2_048,
        provider: 'anthropic',
      }),
    ).toBe(estimateAiCostMicrounits('anthropic', characters, 2_048));
  });

  it('opens model tiers only when the effective plan can fund them', () => {
    expect(allowedAiModelTiers('free')).toEqual(['economy']);
    expect(allowedAiModelTiers('pro')).toEqual(['economy', 'standard']);
    expect(allowedAiModelTiers('team')).toEqual(['economy', 'standard', 'advanced']);
    expect(allowedAiModelTiers('business')).toEqual([
      'economy',
      'standard',
      'advanced',
      'flagship',
    ]);
    expect(isAiModelTierAllowed('free', 'flagship')).toBe(false);
    expect(isAiModelTierAllowed('business', 'flagship')).toBe(true);
  });

  it('warns at 80 and 95 percent and fails closed at 100 percent', () => {
    expect(evaluateUsageBudget({ budgetMicrounits: 100, usedMicrounits: 79 }).level).toBe('normal');
    expect(evaluateUsageBudget({ budgetMicrounits: 100, usedMicrounits: 80 }).level).toBe(
      'warning',
    );
    expect(evaluateUsageBudget({ budgetMicrounits: 100, usedMicrounits: 95 }).level).toBe(
      'critical',
    );
    const blocked = evaluateUsageBudget({ budgetMicrounits: 100, usedMicrounits: 100 });
    expect(blocked.level).toBe('blocked');
    expect(canReserveUsage(blocked, 0)).toBe(false);
  });

  it('includes active reservations when deciding whether another call is safe', () => {
    const snapshot = evaluateUsageBudget({
      budgetMicrounits: 1_000,
      reservedMicrounits: 150,
      usedMicrounits: 700,
    });
    expect(canReserveUsage(snapshot, 150)).toBe(true);
    expect(canReserveUsage(snapshot, 151)).toBe(false);
  });

  it('keeps every plan cost budget bounded below its monthly catalog price', () => {
    for (const planCode of ['pro', 'team', 'business'] as const) {
      const plan = getProductPlan(planCode);
      expect(plan.monthlyAiCostBudgetMicrounits).toBeLessThan(plan.monthlyPriceTwd * 1_000_000);
      expect(plan.maximumAiRequestCostMicrounits).toBeLessThan(plan.monthlyAiCostBudgetMicrounits);
      expect(plan.aiRequestsPerMinute).toBeGreaterThan(0);
      expect(plan.monthlySourceBytes).toBeGreaterThan(1_048_576);
    }
  });

  it('registers website image generation as a quota-controlled AI operation', () => {
    expect(UsageOperationSchema.parse('website_image_generation')).toBe('website_image_generation');
  });
});
