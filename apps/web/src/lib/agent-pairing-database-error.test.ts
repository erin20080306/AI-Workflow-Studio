import { AgentProtocolError } from '@ai-workflow-studio/agent-protocol';
import { describe, expect, it } from 'vitest';

import { mapCompletePairingDatabaseError } from './agent-pairing-database-error';

describe('complete pairing database errors', () => {
  it.each(['free', 'pro', 'team', 'business'])(
    'maps the %s plan device limit to one fixed safe protocol error',
    (plan) => {
      const mapped = mapCompletePairingDatabaseError({
        code: '23514',
        details: 'database details must not be exposed',
        hint: null,
        message: `${plan} plan device limit reached`,
      });

      expect(mapped).toBeInstanceOf(AgentProtocolError);
      expect(mapped).toMatchObject({
        code: 'AGENT_DEVICE_LIMIT_REACHED',
        details: undefined,
        message: 'The workspace has reached its Desktop Agent device limit.',
      });
      expect(mapped?.message).not.toContain(plan);
    },
  );

  it.each([
    { code: '23505', message: 'free plan device limit reached' },
    { code: '23514', message: 'enterprise plan device limit reached' },
    { code: '23514', message: 'free plan workflow limit reached' },
    { code: '23514', message: 'Free plan device limit reached' },
    { code: '23514', message: 'free plan device limit reached: internal context' },
    null,
  ])('does not map any database error outside the exact allowlist', (error) => {
    expect(mapCompletePairingDatabaseError(error)).toBeUndefined();
  });
});
