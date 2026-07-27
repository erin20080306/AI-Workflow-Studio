import 'server-only';

import {
  InMemoryScheduleService,
  ScheduleCreateInputSchema,
  ScheduleError,
  ScheduleRuleSchema,
  ScheduleSchema,
  ScheduleStatusUpdateSchema,
  ScheduleTargetSchema,
  nextScheduleOccurrence,
  scheduleRuleToCron,
  type Schedule,
  type ScheduleCreateInput,
  type ScheduleTarget,
  type ScheduleTickResult,
} from '@ai-workflow-studio/scheduler';
import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

import { getEnvironment } from './env';
import { MOCK_DEVICE_ID, MOCK_VERSION_ID, MOCK_WORKFLOW, MOCK_WORKFLOW_ID } from './mock-workflows';
import { createMockRun } from './run-server';

export const MOCK_SCHEDULE_CRON_SECRET = 'mock-only-schedule-cron-secret-v1';

const MOCK_TARGET = ScheduleTargetSchema.parse({
  deviceId: MOCK_DEVICE_ID,
  deviceName: 'Erin’s MacBook Air',
  workflowId: MOCK_WORKFLOW_ID,
  workflowName: MOCK_WORKFLOW.name,
  workflowVersionId: MOCK_VERSION_ID,
});

const WorkflowRowSchema = z.object({
  active_version_id: z.string().uuid().nullable(),
  execution_target: z.unknown(),
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  status: z.enum(['active', 'archived', 'disabled', 'draft']),
});
const DesktopTargetSchema = z
  .object({
    deviceId: z.string().uuid(),
    type: z.literal('desktop'),
  })
  .strict();
const DeviceRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  status: z.enum(['offline', 'online', 'pairing', 'revoked']),
});
const ScheduleRowSchema = z.object({
  created_at: z.string().datetime({ offset: true }),
  created_by: z.string().uuid(),
  cron_expression: z.string(),
  device_id: z.string().uuid(),
  failure_count: z.number().int(),
  id: z.string().uuid(),
  last_error_code: z.string().nullable(),
  last_fired_at: z.string().datetime({ offset: true }).nullable(),
  max_failures: z.number().int(),
  next_run_at: z.string().datetime({ offset: true }),
  rule: z.unknown(),
  status: z.enum(['active', 'disabled', 'paused']),
  tenant_id: z.string().uuid(),
  timezone: z.string(),
  updated_at: z.string().datetime({ offset: true }),
  workflow_id: z.string().uuid(),
  workflow_version_id: z.string().uuid(),
});

const scheduleGlobal = globalThis as typeof globalThis & {
  __aiWorkflowScheduleService?: InMemoryScheduleService;
};

function mockService(): InMemoryScheduleService {
  scheduleGlobal.__aiWorkflowScheduleService ??= new InMemoryScheduleService();
  return scheduleGlobal.__aiWorkflowScheduleService;
}

function assertCanMutate(context: WorkspaceContext): void {
  if (context.actor.role === 'viewer') {
    throw new ScheduleError('SCHEDULE_FORBIDDEN', 'Viewer access cannot change schedules.');
  }
}

async function productionTargets(context: WorkspaceContext): Promise<readonly ScheduleTarget[]> {
  const admin = createSupabaseAdminClient();
  const [workflowResult, deviceResult] = await Promise.all([
    admin
      .from('workflows')
      .select('id, name, status, active_version_id, execution_target')
      .eq('tenant_id', context.actor.tenantId)
      .eq('status', 'active')
      .not('active_version_id', 'is', null)
      .order('name'),
    admin
      .from('devices')
      .select('id, name, status')
      .eq('tenant_id', context.actor.tenantId)
      .neq('status', 'revoked'),
  ]);
  if (workflowResult.error !== null || deviceResult.error !== null) {
    throw new ScheduleError('SCHEDULE_STATE_CONFLICT', 'Schedule targets could not be loaded.');
  }
  const workflows = z.array(WorkflowRowSchema).parse(workflowResult.data);
  const devices = new Map(
    z
      .array(DeviceRowSchema)
      .parse(deviceResult.data)
      .map((device) => [device.id, device] as const),
  );
  return workflows.flatMap((workflow) => {
    const executionTarget = DesktopTargetSchema.safeParse(workflow.execution_target);
    const device = executionTarget.success ? devices.get(executionTarget.data.deviceId) : undefined;
    if (device === undefined || workflow.active_version_id === null) {
      return [];
    }
    return [
      ScheduleTargetSchema.parse({
        deviceId: device.id,
        deviceName: device.name,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowVersionId: workflow.active_version_id,
      }),
    ];
  });
}

async function targets(context: WorkspaceContext): Promise<readonly ScheduleTarget[]> {
  return getEnvironment().mockMode ? [MOCK_TARGET] : await productionTargets(context);
}

function mapSchedule(
  rowInput: z.infer<typeof ScheduleRowSchema>,
  targetInput: ScheduleTarget,
): Schedule {
  const row = ScheduleRowSchema.parse(rowInput);
  const target = ScheduleTargetSchema.parse(targetInput);
  if (
    target.workflowId !== row.workflow_id ||
    target.workflowVersionId !== row.workflow_version_id ||
    target.deviceId !== row.device_id
  ) {
    throw new ScheduleError(
      'SCHEDULE_STATE_CONFLICT',
      'A schedule target does not match its persisted references.',
    );
  }
  return ScheduleSchema.parse({
    createdAt: row.created_at,
    createdBy: row.created_by,
    cron: row.cron_expression,
    failureCount: row.failure_count,
    id: row.id,
    ...(row.last_error_code === null ? {} : { lastErrorCode: row.last_error_code }),
    ...(row.last_fired_at === null ? {} : { lastFiredAt: row.last_fired_at }),
    maxFailures: row.max_failures,
    nextRunAt: row.next_run_at,
    rule: ScheduleRuleSchema.parse(row.rule),
    status: row.status,
    target,
    tenantId: row.tenant_id,
    timezone: row.timezone,
    updatedAt: row.updated_at,
  });
}

async function productionSchedules(context: WorkspaceContext): Promise<readonly Schedule[]> {
  const admin = createSupabaseAdminClient();
  const result = await admin
    .from('workflow_schedules')
    .select('*')
    .eq('tenant_id', context.actor.tenantId)
    .order('next_run_at');
  if (result.error !== null) {
    throw new ScheduleError('SCHEDULE_STATE_CONFLICT', 'Schedules could not be loaded.');
  }
  const rows = z.array(ScheduleRowSchema).parse(result.data);
  if (rows.length === 0) {
    return [];
  }
  const [workflowResult, deviceResult] = await Promise.all([
    admin
      .from('workflows')
      .select('id, name, status, active_version_id, execution_target')
      .eq('tenant_id', context.actor.tenantId)
      .in('id', [...new Set(rows.map((row) => row.workflow_id))]),
    admin
      .from('devices')
      .select('id, name, status')
      .eq('tenant_id', context.actor.tenantId)
      .in('id', [...new Set(rows.map((row) => row.device_id))]),
  ]);
  if (workflowResult.error !== null || deviceResult.error !== null) {
    throw new ScheduleError('SCHEDULE_STATE_CONFLICT', 'Schedule targets could not be loaded.');
  }
  const workflows = new Map(
    z
      .array(WorkflowRowSchema)
      .parse(workflowResult.data)
      .map((workflow) => [workflow.id, workflow] as const),
  );
  const devices = new Map(
    z
      .array(DeviceRowSchema)
      .parse(deviceResult.data)
      .map((device) => [device.id, device] as const),
  );
  return rows.map((row) => {
    const workflow = workflows.get(row.workflow_id);
    const device = devices.get(row.device_id);
    if (workflow === undefined || device === undefined) {
      throw new ScheduleError(
        'SCHEDULE_STATE_CONFLICT',
        'A persisted schedule target could not be resolved.',
      );
    }
    return mapSchedule(
      row,
      ScheduleTargetSchema.parse({
        deviceId: device.id,
        deviceName: device.name,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowVersionId: row.workflow_version_id,
      }),
    );
  });
}

export async function schedulePageState(context: WorkspaceContext): Promise<{
  readonly schedules: readonly Schedule[];
  readonly targets: readonly ScheduleTarget[];
}> {
  const availableTargets = await targets(context);
  return {
    schedules: getEnvironment().mockMode
      ? mockService().list(context.actor.tenantId)
      : await productionSchedules(context),
    targets: availableTargets,
  };
}

export async function createSchedule(
  context: WorkspaceContext,
  inputValue: ScheduleCreateInput,
): Promise<Schedule> {
  assertCanMutate(context);
  const input = ScheduleCreateInputSchema.parse(inputValue);
  const availableTargets = await targets(context);
  const canonicalTarget = availableTargets.find(
    (target) =>
      target.workflowId === input.target.workflowId &&
      target.workflowVersionId === input.target.workflowVersionId &&
      target.deviceId === input.target.deviceId,
  );
  if (canonicalTarget === undefined) {
    throw new ScheduleError(
      'SCHEDULE_INVALID',
      'The selected workflow target is not active or authorized.',
    );
  }
  const canonicalInput = ScheduleCreateInputSchema.parse({
    ...input,
    target: canonicalTarget,
  });
  if (getEnvironment().mockMode) {
    return mockService().create(context.actor, canonicalInput);
  }

  const nextRunAt = nextScheduleOccurrence(
    canonicalInput.rule,
    canonicalInput.timezone,
    new Date(),
  ).toISOString();
  const admin = createSupabaseAdminClient();
  const result = await admin
    .from('workflow_schedules')
    .insert({
      created_by: context.actor.userId,
      cron_expression: scheduleRuleToCron(canonicalInput.rule),
      device_id: canonicalTarget.deviceId,
      next_run_at: nextRunAt,
      rule: canonicalInput.rule,
      tenant_id: context.actor.tenantId,
      timezone: canonicalInput.timezone,
      workflow_id: canonicalTarget.workflowId,
      workflow_version_id: canonicalTarget.workflowVersionId,
    })
    .select('*')
    .single();
  const row = ScheduleRowSchema.safeParse(result.data);
  if (result.error !== null || !row.success) {
    throw new ScheduleError('SCHEDULE_STATE_CONFLICT', 'The schedule could not be saved.');
  }
  await admin.from('audit_logs').insert({
    action: 'schedule.created',
    actor_user_id: context.actor.userId,
    correlation_id: row.data.id,
    metadata: {
      cron: row.data.cron_expression,
      timezone: row.data.timezone,
      workflowVersionId: row.data.workflow_version_id,
    },
    resource_id: row.data.id,
    resource_type: 'workflow_schedule',
    tenant_id: context.actor.tenantId,
  });
  return mapSchedule(row.data, canonicalTarget);
}

export async function updateScheduleStatus(
  context: WorkspaceContext,
  scheduleId: string,
  inputValue: unknown,
): Promise<Schedule> {
  assertCanMutate(context);
  const { status } = ScheduleStatusUpdateSchema.parse(inputValue);
  if (getEnvironment().mockMode) {
    return mockService().updateStatus(context.actor, scheduleId, status);
  }
  const savedSchedules = await productionSchedules(context);
  const savedSchedule = savedSchedules.find((schedule) => schedule.id === scheduleId);
  if (savedSchedule === undefined) {
    throw new ScheduleError('SCHEDULE_NOT_FOUND', 'Schedule was not found.');
  }
  const existingResult = await createSupabaseAdminClient()
    .from('workflow_schedules')
    .select('*')
    .eq('tenant_id', context.actor.tenantId)
    .eq('id', z.string().uuid().parse(scheduleId))
    .maybeSingle();
  const existing = ScheduleRowSchema.safeParse(existingResult.data);
  if (existingResult.error !== null) {
    throw new ScheduleError('SCHEDULE_STATE_CONFLICT', 'The schedule could not be read.');
  }
  if (!existing.success) {
    throw new ScheduleError('SCHEDULE_NOT_FOUND', 'Schedule was not found.');
  }
  const rule = ScheduleRuleSchema.parse(existing.data.rule);
  const result = await createSupabaseAdminClient()
    .from('workflow_schedules')
    .update({
      ...(status === 'active'
        ? {
            failure_count: 0,
            last_error_code: null,
            next_run_at: nextScheduleOccurrence(
              rule,
              existing.data.timezone,
              new Date(),
            ).toISOString(),
          }
        : {}),
      status,
    })
    .eq('tenant_id', context.actor.tenantId)
    .eq('id', existing.data.id)
    .select('*')
    .single();
  const row = ScheduleRowSchema.safeParse(result.data);
  if (result.error !== null || !row.success) {
    throw new ScheduleError('SCHEDULE_STATE_CONFLICT', 'The schedule could not be updated.');
  }
  await createSupabaseAdminClient()
    .from('audit_logs')
    .insert({
      action: status === 'active' ? 'schedule.resumed' : 'schedule.paused',
      actor_user_id: context.actor.userId,
      correlation_id: row.data.id,
      metadata: { status },
      resource_id: row.data.id,
      resource_type: 'workflow_schedule',
      tenant_id: context.actor.tenantId,
    });
  return mapSchedule(row.data, savedSchedule.target);
}

export async function tickSchedules(at: Date): Promise<ScheduleTickResult> {
  if (!getEnvironment().mockMode) {
    throw new ScheduleError(
      'SCHEDULE_STATE_CONFLICT',
      'Durable production run dispatch is not configured.',
    );
  }
  return await mockService().tick(at, async (schedule, idempotencyKey) => {
    const result = await createMockRun({
      deviceId: schedule.target.deviceId,
      idempotencyKey,
      requiresApproval: true,
      timeoutSeconds: 1_800,
    });
    return { runId: result.run.id };
  });
}
