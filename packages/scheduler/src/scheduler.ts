import { z } from 'zod';

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime({ offset: true });
const TimeOfDaySchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Time must use 24-hour HH:mm format');

export function isSupportedTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const TimeZoneSchema = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .refine(isSupportedTimeZone, 'Timezone must be a supported IANA identifier');

export const ScheduleRuleSchema = z.discriminatedUnion('cadence', [
  z.object({ cadence: z.literal('every_15_minutes') }).strict(),
  z.object({ cadence: z.literal('hourly') }).strict(),
  z.object({ cadence: z.literal('daily'), time: TimeOfDaySchema }).strict(),
  z.object({ cadence: z.literal('weekdays'), time: TimeOfDaySchema }).strict(),
]);

export const ScheduleTargetSchema = z
  .object({
    deviceId: UuidSchema,
    deviceName: z.string().trim().min(1).max(120),
    workflowId: UuidSchema,
    workflowName: z.string().trim().min(1).max(160),
    workflowVersionId: UuidSchema,
  })
  .strict();

export const ScheduleCreateInputSchema = z
  .object({
    rule: ScheduleRuleSchema,
    target: ScheduleTargetSchema,
    timezone: TimeZoneSchema,
  })
  .strict();

export const ScheduleStatusUpdateSchema = z
  .object({
    status: z.enum(['active', 'paused']),
  })
  .strict();

export const ScheduleSchema = z
  .object({
    createdAt: TimestampSchema,
    createdBy: UuidSchema,
    cron: z.string().trim().min(9).max(40),
    failureCount: z.number().int().min(0).max(10),
    id: UuidSchema,
    lastErrorCode: z.string().trim().min(1).max(120).optional(),
    lastFiredAt: TimestampSchema.optional(),
    maxFailures: z.number().int().min(1).max(10),
    nextRunAt: TimestampSchema,
    rule: ScheduleRuleSchema,
    status: z.enum(['active', 'disabled', 'paused']),
    target: ScheduleTargetSchema,
    tenantId: UuidSchema,
    timezone: TimeZoneSchema,
    updatedAt: TimestampSchema,
  })
  .strict();

export const ScheduleFireSchema = z
  .object({
    dueAt: TimestampSchema,
    errorCode: z.string().trim().min(1).max(120).optional(),
    id: UuidSchema,
    idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/),
    runId: UuidSchema.optional(),
    scheduleId: UuidSchema,
    status: z.enum(['failed', 'run_created']),
    tenantId: UuidSchema,
  })
  .strict();

export type ScheduleRule = z.infer<typeof ScheduleRuleSchema>;
export type ScheduleTarget = z.infer<typeof ScheduleTargetSchema>;
export type ScheduleCreateInput = z.infer<typeof ScheduleCreateInputSchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
export type ScheduleFire = z.infer<typeof ScheduleFireSchema>;
export type ScheduleRole = 'admin' | 'editor' | 'owner' | 'viewer';

export class ScheduleError extends Error {
  readonly code:
    'SCHEDULE_FORBIDDEN' | 'SCHEDULE_INVALID' | 'SCHEDULE_NOT_FOUND' | 'SCHEDULE_STATE_CONFLICT';

  constructor(code: ScheduleError['code'], message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'ScheduleError';
  }
}

interface LocalMinute {
  readonly hour: number;
  readonly minute: number;
  readonly weekday: string;
}

function localMinute(at: Date, timezone: string): LocalMinute {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone: timezone,
    weekday: 'short',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((candidate) => candidate.type === type)?.value;
    if (part === undefined) {
      throw new ScheduleError('SCHEDULE_INVALID', 'Timezone conversion failed.');
    }
    return part;
  };
  return {
    hour: Number(value('hour')) % 24,
    minute: Number(value('minute')),
    weekday: value('weekday'),
  };
}

function ruleMatches(rule: ScheduleRule, local: LocalMinute): boolean {
  if (rule.cadence === 'every_15_minutes') {
    return local.minute % 15 === 0;
  }
  if (rule.cadence === 'hourly') {
    return local.minute === 0;
  }
  const [hour, minute] = rule.time.split(':').map(Number);
  if (local.hour !== hour || local.minute !== minute) {
    return false;
  }
  return rule.cadence === 'daily' || (local.weekday !== 'Sat' && local.weekday !== 'Sun');
}

export function scheduleRuleToCron(ruleInput: ScheduleRule): string {
  const rule = ScheduleRuleSchema.parse(ruleInput);
  if (rule.cadence === 'every_15_minutes') {
    return '*/15 * * * *';
  }
  if (rule.cadence === 'hourly') {
    return '0 * * * *';
  }
  const [hour, minute] = rule.time.split(':');
  return `${Number(minute)} ${Number(hour)} * * ${rule.cadence === 'weekdays' ? '1-5' : '*'}`;
}

export function nextScheduleOccurrence(
  ruleInput: ScheduleRule,
  timezoneInput: string,
  afterInput: Date | string,
): Date {
  const rule = ScheduleRuleSchema.parse(ruleInput);
  const timezone = TimeZoneSchema.parse(timezoneInput);
  const after = new Date(afterInput);
  if (!Number.isFinite(after.getTime())) {
    throw new ScheduleError('SCHEDULE_INVALID', 'Schedule time is invalid.');
  }
  const firstMinute = Math.floor(after.getTime() / 60_000) * 60_000 + 60_000;
  const maximumMinutes = 8 * 24 * 60;
  for (let offset = 0; offset <= maximumMinutes; offset += 1) {
    const candidate = new Date(firstMinute + offset * 60_000);
    if (ruleMatches(rule, localMinute(candidate, timezone))) {
      return candidate;
    }
  }
  throw new ScheduleError('SCHEDULE_INVALID', 'No bounded schedule occurrence was found.');
}

interface ScheduleActor {
  readonly role: ScheduleRole;
  readonly tenantId: string;
  readonly userId: string;
}

export interface ScheduleDispatch {
  (
    schedule: Schedule,
    idempotencyKey: string,
  ): Promise<{
    readonly runId: string;
  }>;
}

export interface ScheduleTickResult {
  readonly duplicateCount: number;
  readonly failedCount: number;
  readonly fires: readonly ScheduleFire[];
  readonly runCount: number;
}

function assertCanMutate(actor: ScheduleActor): void {
  if (actor.role === 'viewer') {
    throw new ScheduleError('SCHEDULE_FORBIDDEN', 'Viewer access cannot change schedules.');
  }
}

export class InMemoryScheduleService {
  private readonly fires = new Map<string, ScheduleFire>();
  private readonly schedules = new Map<string, Schedule>();

  create(
    actorInput: ScheduleActor,
    inputValue: ScheduleCreateInput,
    nowInput = new Date(),
  ): Schedule {
    const actor = z
      .object({
        role: z.enum(['owner', 'admin', 'editor', 'viewer']),
        tenantId: UuidSchema,
        userId: UuidSchema,
      })
      .strict()
      .parse(actorInput);
    assertCanMutate(actor);
    const input = ScheduleCreateInputSchema.parse(inputValue);
    const now = new Date(nowInput);
    const createdAt = now.toISOString();
    const schedule = ScheduleSchema.parse({
      createdAt,
      createdBy: actor.userId,
      cron: scheduleRuleToCron(input.rule),
      failureCount: 0,
      id: crypto.randomUUID(),
      maxFailures: 3,
      nextRunAt: nextScheduleOccurrence(input.rule, input.timezone, now).toISOString(),
      rule: input.rule,
      status: 'active',
      target: input.target,
      tenantId: actor.tenantId,
      timezone: input.timezone,
      updatedAt: createdAt,
    });
    this.schedules.set(schedule.id, schedule);
    return structuredClone(schedule);
  }

  list(tenantIdInput: string): readonly Schedule[] {
    const tenantId = UuidSchema.parse(tenantIdInput);
    return [...this.schedules.values()]
      .filter((schedule) => schedule.tenantId === tenantId)
      .sort((left, right) => left.nextRunAt.localeCompare(right.nextRunAt))
      .map((schedule) => structuredClone(schedule));
  }

  updateStatus(
    actorInput: ScheduleActor,
    scheduleIdInput: string,
    statusValue: 'active' | 'paused',
    nowInput = new Date(),
  ): Schedule {
    const actor = z
      .object({
        role: z.enum(['owner', 'admin', 'editor', 'viewer']),
        tenantId: UuidSchema,
        userId: UuidSchema,
      })
      .strict()
      .parse(actorInput);
    assertCanMutate(actor);
    const scheduleId = UuidSchema.parse(scheduleIdInput);
    const status = ScheduleStatusUpdateSchema.parse({ status: statusValue }).status;
    const current = this.schedules.get(scheduleId);
    if (current === undefined || current.tenantId !== actor.tenantId) {
      throw new ScheduleError('SCHEDULE_NOT_FOUND', 'Schedule was not found.');
    }
    const now = new Date(nowInput);
    const updated = ScheduleSchema.parse({
      ...current,
      ...(status === 'active'
        ? { nextRunAt: nextScheduleOccurrence(current.rule, current.timezone, now).toISOString() }
        : {}),
      status,
      updatedAt: now.toISOString(),
    });
    this.schedules.set(updated.id, updated);
    return structuredClone(updated);
  }

  async tick(
    atInput: Date,
    dispatch: ScheduleDispatch,
    limitInput = 25,
  ): Promise<ScheduleTickResult> {
    const at = new Date(atInput);
    const limit = z.number().int().min(1).max(100).parse(limitInput);
    const due = [...this.schedules.values()]
      .filter(
        (schedule) =>
          schedule.status === 'active' && new Date(schedule.nextRunAt).getTime() <= at.getTime(),
      )
      .sort((left, right) => left.nextRunAt.localeCompare(right.nextRunAt))
      .slice(0, limit);
    const fires: ScheduleFire[] = [];
    let duplicateCount = 0;
    let failedCount = 0;
    let runCount = 0;

    for (const schedule of due) {
      const dueAt = schedule.nextRunAt;
      const idempotencyKey = `schedule:${schedule.id}:${dueAt}`;
      if (this.fires.has(idempotencyKey)) {
        duplicateCount += 1;
        continue;
      }
      try {
        const dispatched = z
          .object({ runId: UuidSchema })
          .strict()
          .parse(await dispatch(structuredClone(schedule), idempotencyKey));
        const fire = ScheduleFireSchema.parse({
          dueAt,
          id: crypto.randomUUID(),
          idempotencyKey,
          runId: dispatched.runId,
          scheduleId: schedule.id,
          status: 'run_created',
          tenantId: schedule.tenantId,
        });
        this.fires.set(idempotencyKey, fire);
        fires.push(fire);
        runCount += 1;
        this.schedules.set(
          schedule.id,
          ScheduleSchema.parse({
            ...schedule,
            failureCount: 0,
            lastErrorCode: undefined,
            lastFiredAt: dueAt,
            nextRunAt: nextScheduleOccurrence(
              schedule.rule,
              schedule.timezone,
              dueAt,
            ).toISOString(),
            updatedAt: at.toISOString(),
          }),
        );
      } catch (error) {
        const failureCount = schedule.failureCount + 1;
        const errorCode = error instanceof ScheduleError ? error.code : 'SCHEDULE_DISPATCH_FAILED';
        const fire = ScheduleFireSchema.parse({
          dueAt,
          errorCode,
          id: crypto.randomUUID(),
          idempotencyKey,
          scheduleId: schedule.id,
          status: 'failed',
          tenantId: schedule.tenantId,
        });
        this.fires.set(idempotencyKey, fire);
        fires.push(fire);
        failedCount += 1;
        this.schedules.set(
          schedule.id,
          ScheduleSchema.parse({
            ...schedule,
            failureCount,
            lastErrorCode: errorCode,
            nextRunAt: nextScheduleOccurrence(
              schedule.rule,
              schedule.timezone,
              dueAt,
            ).toISOString(),
            status: failureCount >= schedule.maxFailures ? 'paused' : 'active',
            updatedAt: at.toISOString(),
          }),
        );
      }
    }

    return { duplicateCount, failedCount, fires, runCount };
  }
}
