import { describe, expect, it } from 'vitest';

import { plannerAccessDecision } from './control-plane-access';

describe('control-plane access policy', () => {
  it('allows only the deterministic Mock planner before Auth is connected', () => {
    expect(plannerAccessDecision(true, 'mock', false)).toEqual({ allowed: true });
    expect(plannerAccessDecision(true, 'openai', false)).toMatchObject({
      allowed: false,
      code: 'AI_EXTERNAL_PROVIDER_REQUIRES_AUTH',
      status: 403,
    });
  });

  it('fails closed when production authentication is not yet connected', () => {
    expect(plannerAccessDecision(false, 'mock', false)).toMatchObject({
      allowed: false,
      code: 'AI_AUTH_REQUIRED',
      status: 401,
    });
  });

  it('allows validated providers for an authenticated production workspace', () => {
    expect(plannerAccessDecision(false, 'openai', true)).toEqual({ allowed: true });
  });
});
