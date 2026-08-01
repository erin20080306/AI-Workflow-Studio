import { describe, expect, it } from 'vitest';

import {
  InMemoryScheduleService,
  ScheduleError,
  nextScheduleOccurrence,
  scheduleRuleToCron,
} from './scheduler';

const actor = {
  role: 'owner' as const,
  tenantId: '10000000-0000-4000-8000-000000000701',
  userId: '10000000-0000-4000-8000-000000000702',
};
const target = {
  deviceId: '00000000-0000-4000-8000-000000000501',
  deviceName: 'Erin’s MacBook Air',
  executionTarget: 'desktop' as const,
  workflowId: '00000000-0000-4000-8000-000000000503',
  workflowName: '每日訂單彙整',
  workflowVersionId: '00000000-0000-4000-8000-000000000504',
};
const cloudTarget = {
  executionTarget: 'cloud' as const,
  workflowId: '00000000-0000-4000-8000-000000000603',
  workflowName: '每日雲端摘要',
  workflowVersionId: '00000000-0000-4000-8000-000000000604',
};

describe('safe recurring schedules', () => {
  it('maps presets to bounded cron and respects the selected timezone', () => {
    expect(scheduleRuleToCron({ cadence: 'every_15_minutes' })).toBe('*/15 * * * *');
    expect(scheduleRuleToCron({ cadence: 'weekdays', time: '09:30' })).toBe('30 9 * * 1-5');
    expect(
      nextScheduleOccurrence(
        { cadence: 'daily', time: '09:00' },
        'Asia/Taipei',
        '2026-07-27T00:30:00.000Z',
      ).toISOString(),
    ).toBe('2026-07-27T01:00:00.000Z');
  });

  it('dispatches each due occurrence once with a stable idempotency key', async () => {
    const service = new InMemoryScheduleService();
    const schedule = service.create(
      actor,
      {
        rule: { cadence: 'every_15_minutes' },
        target,
        timezone: 'Asia/Taipei',
      },
      new Date('2026-07-27T00:01:00.000Z'),
    );
    const calls: string[] = [];
    const result = await service.tick(new Date(schedule.nextRunAt), async (_record, key) => {
      calls.push(key);
      return { runId: '20000000-0000-4000-8000-000000000001' };
    });
    const duplicate = await service.tick(new Date(schedule.nextRunAt), async () => {
      throw new Error('must not dispatch twice');
    });

    expect(result.runCount).toBe(1);
    expect(result.fires[0]?.idempotencyKey).toBe(calls[0]);
    expect(duplicate.runCount).toBe(0);
  });

  it('schedules a Cloud workflow without requiring a Desktop device', async () => {
    const service = new InMemoryScheduleService();
    const schedule = service.create(
      actor,
      {
        rule: { cadence: 'hourly' },
        target: cloudTarget,
        timezone: 'Asia/Taipei',
      },
      new Date('2026-07-27T00:01:00.000Z'),
    );
    expect(schedule.target).toMatchObject({ executionTarget: 'cloud' });
    expect(schedule.target.deviceId).toBeUndefined();
  });

  it('rejects viewer mutation and pauses after three dispatch failures', async () => {
    const service = new InMemoryScheduleService();
    expect(() =>
      service.create(
        { ...actor, role: 'viewer' },
        {
          rule: { cadence: 'hourly' },
          target,
          timezone: 'Asia/Taipei',
        },
      ),
    ).toThrowError(ScheduleError);

    let schedule = service.create(
      actor,
      {
        rule: { cadence: 'every_15_minutes' },
        target,
        timezone: 'Asia/Taipei',
      },
      new Date('2026-07-27T00:01:00.000Z'),
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await service.tick(new Date(schedule.nextRunAt), async () => {
        throw new Error('temporary adapter failure');
      });
      schedule = service.list(actor.tenantId)[0]!;
    }
    expect(schedule.failureCount).toBe(3);
    expect(schedule.status).toBe('paused');
    expect(schedule.lastErrorCode).toBe('SCHEDULE_DISPATCH_FAILED');
  });
});
