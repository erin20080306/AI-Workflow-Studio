import { describe, expect, it } from 'vitest';

import { isPlanCode, PLAN_CODES, PRODUCT_PLANS, type PlanCode } from './plans';

const plan = (code: PlanCode) => {
  const found = PRODUCT_PLANS.find((candidate) => candidate.code === code);
  if (found === undefined) throw new Error(`Missing plan ${code}`);
  return found;
};

describe('product plans', () => {
  it('offers a single-device Personal plan between Free and Pro', () => {
    expect(PLAN_CODES).toContain('personal');
    const personal = plan('personal');
    expect(personal.monthlyPriceTwd).toBe(99);
    expect(personal.deviceLimit).toBe(1);
    expect(personal.memberLimit).toBe(1);
    expect(personal.maximumAiModelTier).toBe('standard');
    const free = plan('free');
    const pro = plan('pro');
    // Personal sits between Free and Pro on price and AI budget.
    expect(free.monthlyPriceTwd).toBeLessThan(personal.monthlyPriceTwd);
    expect(personal.monthlyPriceTwd).toBeLessThan(pro.monthlyPriceTwd);
    expect(free.monthlyAiCostBudgetMicrounits).toBeLessThan(personal.monthlyAiCostBudgetMicrounits);
    expect(personal.monthlyAiCostBudgetMicrounits).toBeLessThan(pro.monthlyAiCostBudgetMicrounits);
    // Free is tightened to a trial.
    expect(free.workflowLimit).toBe(2);
    expect(free.monthlyRunLimit).toBe(50);
  });

  it('keeps unique plan codes and annual prices below twelve monthly payments', () => {
    expect(new Set(PRODUCT_PLANS.map((plan) => plan.code)).size).toBe(PRODUCT_PLANS.length);
    for (const plan of PRODUCT_PLANS) {
      expect(plan.annualPriceTwd).toBeLessThanOrEqual(plan.monthlyPriceTwd * 12);
      expect(plan.aiRequestsPerMinute).toBeGreaterThan(0);
      expect(plan.monthlyAiCostBudgetMicrounits).toBeGreaterThan(0);
      expect(plan.maximumAiRequestCostMicrounits).toBeGreaterThan(0);
      expect(plan.monthlySourceBytes).toBeGreaterThan(0);
      expect(plan.monthlyToolCallLimit).toBeGreaterThan(0);
    }
  });

  it('validates only configured plan codes', () => {
    expect(isPlanCode('team')).toBe(true);
    expect(isPlanCode('unlimited')).toBe(false);
  });
});
