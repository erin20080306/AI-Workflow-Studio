import 'server-only';

import {
  InMemoryScheduleService,
  ScheduleCreateInputSchema,
  ScheduleError,
  ScheduleRuleSchema,
  ScheduleSchema,
  ScheduleStatusUpdateSchema,
  ScheduleTargetSchema,
  ScheduleFireSchema,
  nextScheduleOccurrence,
  scheduleRuleToCron,
  type Schedule,
  type ScheduleCreateInput,
  type ScheduleTarget,
  type ScheduleTickResult,
} from '@ai-workflow-studio/scheduler';
import { ExecutionTargetSchema, WorkflowSchema } from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

import { getEnvironment } from './env';
import { MOCK_DEVICE_ID, MOCK_VERSION_ID, MOCK_WORKFLOW, MOCK_WORKFLOW_ID } from './mock-workflows';
import { startProductionCloudRun, startProductionRun } from './production-run-server';
import { createMockRun } from './run-server';

export const MOCK_SCHEDULE_CRON_SECRET = 'mock-only-schedule-cron-secret-v1';

const MOCK_TARGET = ScheduleTargetSchema.parse({
  deviceId: MOCK_DEVICE_ID,
  deviceName: 'Erin’s MacBook Air',
  executionTarget: 'desktop',
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
const DeviceRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  status: z.enum(['offline', 'online', 'pairing', 'revoked']),
});
const ScheduleRowSchema = z.object({
  created_at: z.string().datetime({ offset: true }),
  created_by: z.string().uuid(),
  cron_expression: z.string(),
  device_id: z.string().uuid().nullable(),
  execution_target: z.enum(['cloud', 'desktop']),
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
const VersionRowSchema = z.object({
  definition: z.unknown(),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  workflow_id: z.string().uuid(),
});
const MembershipRowSchema = z.object({
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
});
const TenantRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().min(3).max(63),
});
const ProfileRowSchema = z
  .object({ display_name: z.string().min(1).max(120).nullable() })
  .nullable();
const SubscriptionRowSchema = z
  .object({
    plan_code: z.enum(['free', 'pro', 'team', 'business']),
    status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'incomplete']),
  })
  .nullable();

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
    const executionTarget = ExecutionTargetSchema.safeParse(workflow.execution_target);
    if (!executionTarget.success || workflow.active_version_id === null) {
      return [];
    }
    if (executionTarget.data.type === 'cloud') {
      return [
        ScheduleTargetSchema.parse({
          executionTarget: 'cloud',
          workflowId: workflow.id,
          workflowName: workflow.name,
          workflowVersionId: workflow.active_version_id,
        }),
      ];
    }
    const device = devices.get(executionTarget.data.deviceId);
    if (device === undefined) return [];
    return [
      ScheduleTargetSchema.parse({
        deviceId: device.id,
        deviceName: device.name,
        executionTarget: 'desktop',
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
    target.executionTarget !== row.execution_target ||
    target.deviceId !== (row.device_id ?? undefined)
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
      .neq('status', 'revoked'),
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
    if (workflow === undefined) {
      throw new ScheduleError(
        'SCHEDULE_STATE_CONFLICT',
        'A persisted schedule target could not be resolved.',
      );
    }
    const executionTarget = ExecutionTargetSchema.parse(workflow.execution_target);
    if (executionTarget.type !== row.execution_target) {
      throw new ScheduleError(
        'SCHEDULE_STATE_CONFLICT',
        'A persisted schedule execution target no longer matches its workflow.',
      );
    }
    const device = row.device_id === null ? undefined : devices.get(row.device_id);
    if (executionTarget.type === 'desktop' && device === undefined) {
      throw new ScheduleError(
        'SCHEDULE_STATE_CONFLICT',
        'A persisted Desktop schedule device could not be resolved.',
      );
    }
    return mapSchedule(
      row,
      ScheduleTargetSchema.parse({
        ...(device === undefined ? {} : { deviceId: device.id, deviceName: device.name }),
        executionTarget: executionTarget.type,
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
      target.executionTarget === input.target.executionTarget &&
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
      device_id: canonicalTarget.deviceId ?? null,
      execution_target: canonicalTarget.executionTarget,
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

async function scheduledWorkspaceContext(
  tenantId: string,
  userId: string,
): Promise<WorkspaceContext> {
  const admin = createSupabaseAdminClient();
  const [membership, tenant, profile, subscription, platformAdmin] = await Promise.all([
    admin
      .from('memberships')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle(),
    admin.from('tenants').select('id, name, slug').eq('id', tenantId).single(),
    admin.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
    admin
      .from('tenant_subscriptions')
      .select('plan_code, status')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    admin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle(),
  ]);
  if (
    membership.error !== null ||
    tenant.error !== null ||
    profile.error !== null ||
    subscription.error !== null ||
    platformAdmin.error !== null
  ) {
    throw new ScheduleError(
      'SCHEDULE_STATE_CONFLICT',
      'The scheduled workflow actor could not be verified.',
    );
  }
  const parsedMembership = MembershipRowSchema.safeParse(membership.data);
  const parsedTenant = TenantRowSchema.safeParse(tenant.data);
  const parsedProfile = ProfileRowSchema.safeParse(profile.data);
  const parsedSubscription = SubscriptionRowSchema.safeParse(subscription.data);
  if (
    !parsedMembership.success ||
    !parsedTenant.success ||
    !parsedProfile.success ||
    !parsedSubscription.success
  ) {
    throw new ScheduleError(
      'SCHEDULE_STATE_CONFLICT',
      'The scheduled workflow actor is no longer authorized.',
    );
  }
  return {
    actor: {
      role: parsedMembership.data.role,
      tenantId,
      userId,
    },
    displayName: parsedProfile.data?.display_name ?? 'Scheduled workflow owner',
    platformAdmin: platformAdmin.data !== null,
    subscription: {
      plan: parsedSubscription.data?.plan_code ?? 'free',
      status: parsedSubscription.data?.status ?? 'incomplete',
    },
    tenant: parsedTenant.data,
  };
}

function scheduleFailureCode(error: unknown): string {
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z0-9_]{3,120}$/.test(error.code)
  ) {
    return error.code;
  }
  return 'SCHEDULE_DISPATCH_FAILED';
}

async function productionTick(at: Date): Promise<ScheduleTickResult> {
  const admin = createSupabaseAdminClient();
  const dueResult = await admin
    .from('workflow_schedules')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', at.toISOString())
    .order('next_run_at')
    .limit(25);
  if (dueResult.error !== null) {
    throw new ScheduleError('SCHEDULE_STATE_CONFLICT', 'Due schedules could not be loaded.');
  }
  const due = z.array(ScheduleRowSchema).parse(dueResult.data);
  const fires: z.infer<typeof ScheduleFireSchema>[] = [];
  let duplicateCount = 0;
  let failedCount = 0;
  let runCount = 0;

  for (const schedule of due) {
    const dueAt = schedule.next_run_at;
    const idempotencyKey = `schedule:${schedule.id}:${dueAt}`;
    const claim = await admin.rpc('claim_workflow_schedule_fire', {
      target_due_at: dueAt,
      target_idempotency_key: idempotencyKey,
      target_schedule_id: schedule.id,
      target_tenant_id: schedule.tenant_id,
    });
    if (claim.error !== null) {
      throw new ScheduleError('SCHEDULE_STATE_CONFLICT', 'A schedule fire could not be claimed.');
    }
    if (!z.boolean().parse(claim.data)) {
      duplicateCount += 1;
      continue;
    }

    try {
      const [workflowResult, versionResult] = await Promise.all([
        admin
          .from('workflows')
          .select('id, name, status, active_version_id, execution_target')
          .eq('tenant_id', schedule.tenant_id)
          .eq('id', schedule.workflow_id)
          .single(),
        admin
          .from('workflow_versions')
          .select('id, tenant_id, workflow_id, definition')
          .eq('tenant_id', schedule.tenant_id)
          .eq('id', schedule.workflow_version_id)
          .single(),
      ]);
      if (workflowResult.error !== null || versionResult.error !== null) {
        throw new ScheduleError(
          'SCHEDULE_STATE_CONFLICT',
          'The scheduled workflow version could not be loaded.',
        );
      }
      const workflowRow = WorkflowRowSchema.parse(workflowResult.data);
      const version = VersionRowSchema.parse(versionResult.data);
      const workflow = WorkflowSchema.parse(version.definition);
      if (
        workflowRow.status !== 'active' ||
        workflowRow.active_version_id !== schedule.workflow_version_id ||
        version.workflow_id !== schedule.workflow_id ||
        workflow.executionTarget.type !== schedule.execution_target
      ) {
        throw new ScheduleError(
          'SCHEDULE_STATE_CONFLICT',
          'The schedule is no longer bound to the active workflow version.',
        );
      }
      const context = await scheduledWorkspaceContext(schedule.tenant_id, schedule.created_by);
      const sharedInput = {
        idempotencyKey,
        maxAttempts: 2,
        timeoutSeconds: 1_800,
        workflow,
        workflowId: schedule.workflow_id,
        workflowVersionId: schedule.workflow_version_id,
      };
      const started =
        workflow.executionTarget.type === 'cloud'
          ? await startProductionCloudRun(context, sharedInput)
          : await startProductionRun(context.actor, {
              ...sharedInput,
              deviceId: schedule.device_id ?? workflow.executionTarget.deviceId,
            });
      const completedAt = new Date().toISOString();
      const nextRunAt = nextScheduleOccurrence(
        ScheduleRuleSchema.parse(schedule.rule),
        schedule.timezone,
        dueAt,
      ).toISOString();
      const [fireUpdate, scheduleUpdate] = await Promise.all([
        admin
          .from('workflow_schedule_fires')
          .update({
            completed_at: completedAt,
            status: 'run_created',
            workflow_run_id: started.run.id,
          })
          .eq('tenant_id', schedule.tenant_id)
          .eq('idempotency_key', idempotencyKey)
          .eq('status', 'claimed')
          .select('id')
          .single(),
        admin
          .from('workflow_schedules')
          .update({
            failure_count: 0,
            last_error_code: null,
            last_fired_at: dueAt,
            next_run_at: nextRunAt,
          })
          .eq('tenant_id', schedule.tenant_id)
          .eq('id', schedule.id),
      ]);
      if (fireUpdate.error !== null || scheduleUpdate.error !== null) {
        throw new ScheduleError(
          'SCHEDULE_STATE_CONFLICT',
          'The scheduled run result could not be persisted.',
        );
      }
      const fireId = z.object({ id: z.string().uuid() }).parse(fireUpdate.data).id;
      fires.push(
        ScheduleFireSchema.parse({
          dueAt,
          id: fireId,
          idempotencyKey,
          runId: started.run.id,
          scheduleId: schedule.id,
          status: 'run_created',
          tenantId: schedule.tenant_id,
        }),
      );
      runCount += 1;
    } catch (error) {
      const failureCount = schedule.failure_count + 1;
      const errorCode = scheduleFailureCode(error);
      const completedAt = new Date().toISOString();
      const nextRunAt = nextScheduleOccurrence(
        ScheduleRuleSchema.parse(schedule.rule),
        schedule.timezone,
        dueAt,
      ).toISOString();
      const [fireUpdate, scheduleUpdate] = await Promise.all([
        admin
          .from('workflow_schedule_fires')
          .update({ completed_at: completedAt, error_code: errorCode, status: 'failed' })
          .eq('tenant_id', schedule.tenant_id)
          .eq('idempotency_key', idempotencyKey)
          .eq('status', 'claimed')
          .select('id')
          .single(),
        admin
          .from('workflow_schedules')
          .update({
            failure_count: failureCount,
            last_error_code: errorCode,
            next_run_at: nextRunAt,
            status: failureCount >= schedule.max_failures ? 'paused' : 'active',
          })
          .eq('tenant_id', schedule.tenant_id)
          .eq('id', schedule.id),
      ]);
      if (fireUpdate.error !== null || scheduleUpdate.error !== null) {
        throw new ScheduleError(
          'SCHEDULE_STATE_CONFLICT',
          'The failed schedule result could not be persisted.',
        );
      }
      fires.push(
        ScheduleFireSchema.parse({
          dueAt,
          errorCode,
          id: z.object({ id: z.string().uuid() }).parse(fireUpdate.data).id,
          idempotencyKey,
          scheduleId: schedule.id,
          status: 'failed',
          tenantId: schedule.tenant_id,
        }),
      );
      failedCount += 1;
    }
  }

  return { duplicateCount, failedCount, fires, runCount };
}

export async function tickSchedules(at: Date): Promise<ScheduleTickResult> {
  if (!getEnvironment().mockMode) return await productionTick(at);
  return await mockService().tick(at, async (schedule, idempotencyKey) => {
    if (schedule.target.deviceId === undefined) {
      throw new ScheduleError('SCHEDULE_INVALID', 'Mock cloud schedules are not available.');
    }
    const result = await createMockRun({
      deviceId: schedule.target.deviceId,
      idempotencyKey,
      requiresApproval: true,
      timeoutSeconds: 1_800,
    });
    return { runId: result.run.id };
  });
}
