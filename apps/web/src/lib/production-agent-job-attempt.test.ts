import { describe, expect, it } from 'vitest';

import { isCurrentProductionAgentJobAttempt } from './production-agent-job-attempt';

const RUN_ID = '10000000-0000-4000-8000-000000000931';

describe('isCurrentProductionAgentJobAttempt', () => {
  it('accepts only the exact Desktop Job key for the current Run attempt', () => {
    expect(
      isCurrentProductionAgentJobAttempt({
        idempotencyKey: `${RUN_ID}:desktop:2`,
        runAttempt: 2,
        runId: RUN_ID,
      }),
    ).toBe(true);
    expect(
      isCurrentProductionAgentJobAttempt({
        idempotencyKey: `${RUN_ID}:desktop:1`,
        runAttempt: 2,
        runId: RUN_ID,
      }),
    ).toBe(false);
  });

  it('does not accept another Run or a suffixed key', () => {
    expect(
      isCurrentProductionAgentJobAttempt({
        idempotencyKey: '10000000-0000-4000-8000-000000000932:desktop:1',
        runAttempt: 1,
        runId: RUN_ID,
      }),
    ).toBe(false);
    expect(
      isCurrentProductionAgentJobAttempt({
        idempotencyKey: `${RUN_ID}:desktop:1:stale`,
        runAttempt: 1,
        runId: RUN_ID,
      }),
    ).toBe(false);
  });
});
