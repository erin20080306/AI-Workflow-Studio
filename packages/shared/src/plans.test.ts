import { describe, expect, it } from 'vitest';

import { isPlanCode, PRODUCT_PLANS } from './plans';

describe('product plans', () => {
  it('keeps unique plan codes and annual prices below twelve monthly payments', () => {
    expect(new Set(PRODUCT_PLANS.map((plan) => plan.code)).size).toBe(PRODUCT_PLANS.length);
    for (const plan of PRODUCT_PLANS) {
      expect(plan.annualPriceTwd).toBeLessThanOrEqual(plan.monthlyPriceTwd * 12);
      expect(plan.aiRequestsPerMinute).toBeGreaterThan(0);
      expect(plan.monthlyAiCostBudgetMicrounits).toBeGreaterThan(0);
      expect(plan.monthlySourceBytes).toBeGreaterThan(0);
      expect(plan.monthlyToolCallLimit).toBeGreaterThan(0);
    }
  });

  it('validates only configured plan codes', () => {
    expect(isPlanCode('team')).toBe(true);
    expect(isPlanCode('unlimited')).toBe(false);
  });
});
