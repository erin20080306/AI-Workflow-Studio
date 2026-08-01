import { describe, expect, it } from 'vitest';

import { nextRetryTimeoutAt } from './production-run-timeout';

describe('Production run retry timeout', () => {
  it('starts a fresh timeout window with the original bounded duration', () => {
    expect(
      nextRetryTimeoutAt(
        {
          createdAt: '2026-08-01T08:00:00.000Z',
          timeoutAt: '2026-08-01T08:30:00.000Z',
        },
        new Date('2026-08-01T09:00:00.000Z'),
      ),
    ).toBe('2026-08-01T09:30:00.000Z');
  });

  it('clamps an invalidly short original window to the run minimum', () => {
    expect(
      nextRetryTimeoutAt(
        {
          createdAt: '2026-08-01T08:00:00.000Z',
          timeoutAt: '2026-08-01T08:00:01.000Z',
        },
        new Date('2026-08-01T09:00:00.000Z'),
      ),
    ).toBe('2026-08-01T09:00:30.000Z');
  });
});
