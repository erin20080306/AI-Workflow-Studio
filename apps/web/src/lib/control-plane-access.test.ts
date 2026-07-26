import { describe, expect, it } from 'vitest';

import { plannerAccessDecision } from './control-plane-access';

describe('control-plane access policy', () => {
  it('allows only the deterministic Mock planner before Auth is connected', () => {
    expect(plannerAccessDecision(true, 'mock')).toEqual({ allowed: true });
    expect(plannerAccessDecision(true, 'openai')).toMatchObject({
      allowed: false,
      code: 'AI_EXTERNAL_PROVIDER_REQUIRES_AUTH',
      status: 403,
    });
  });

  it('fails closed when production authentication is not yet connected', () => {
    expect(plannerAccessDecision(false, 'mock')).toMatchObject({
      allowed: false,
      code: 'AI_AUTH_REQUIRED',
      status: 503,
    });
  });
});
