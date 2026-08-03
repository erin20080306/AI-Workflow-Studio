import 'server-only';

import {
  RunOrchestrationError,
  RunStepResultSchema,
  WorkflowRunViewSchema,
  type AgentCompletionInput,
  type AgentFailureInput,
  type AgentProgressInput,
  type RunActor,
  type RunStartResult,
  type StartRunInput,
  type WorkflowRunView,
} from '@ai-workflow-studio/run-orchestrator';
import {
  JsonValueSchema,
  StepResultSchema,
  ExecutionTargetSchema,
  WorkflowSchema,
  summarizeWorkflowRisks,
  validateWorkflow,
  type JsonValue,
  type AgentJob,
  type Workflow,
} from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import type { AgentCloudNode } from '@/lib/agent-cloud-step-schema';
import { isAssistantAgentVersionCompatible } from '@/lib/assistant-device-status';
import {
  agentCloudClaimDisposition,
  agentCloudInputHash,
  agentCloudInputsEqual,
  immediateAgentCloudPredecessor,
} from '@/lib/agent-cloud-step-state';
import { validateDesktopExcelProfile } from '@/lib/agent-cloud-step-schema';
import { isAgentCloudNodeType } from '@/lib/agent-progress-schema';
import {
  advanceDriveExcelBatch,
  executeCloudWorkflow,
  executeCloudWorkflowNode,
} from '@/lib/cloud-workflow-executor';
import {
  DriveExcelCheckpointSchema,
  DriveExcelFolderOutputSchema,
  type DriveExcelCheckpoint,
} from '@/lib/cloud-drive-excel-checkpoint';
import { nextRetryTimeoutAt } from '@/lib/production-run-timeout';
import { driveWorkbookProgressForRunStep } from '@/lib/run-drive-workbook-progress';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime({ offset: true });
const RunRowSchema = z.object({
  attempt: z.number().int().min(0),
  completed_at: TimestampSchema.nullable(),
  created_at: TimestampSchema,
  error_code: z.string().max(120).nullable(),
  error_message: z.string().max(500).nullable(),
  id: UuidSchema,
  idempotency_key: z.string().min(8).max(200),
  max_attempts: z.number().int().min(1).max(20),
  started_at: TimestampSchema.nullable(),
  status: z.enum([
    'pending',
    'awaiting_approval',
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled',
    'timed_out',
  ]),
  tenant_id: UuidSchema,
  timeout_at: TimestampSchema,
  triggered_by: UuidSchema.nullable(),
  workflow_id: UuidSchema,
  workflow_version_id: UuidSchema,
});
const WorkflowRowSchema = z.object({
  execution_target: z.unknown(),
  id: UuidSchema,
  name: z.string().min(1).max(160),
  tenant_id: UuidSchema,
});
const VersionRowSchema = z.object({
  definition: z.unknown(),
  id: UuidSchema,
  tenant_id: UuidSchema,
  workflow_id: UuidSchema,
});
const StepRowSchema = z.object({
  attempt: z.number().int().min(1),
  completed_at: TimestampSchema.nullable(),
  error_code: z.string().max(120).nullable(),
  error_message: z.string().max(500).nullable(),
  node_id: z.string().min(1).max(120),
  node_type: z.string().min(1).max(120),
  output_summary: z.record(z.string(), z.unknown()),
  processed_file_count: z.number().int().min(0),
  processed_row_count: z.number().int().min(0),
  started_at: TimestampSchema.nullable(),
  status: z.enum([
    'pending',
    'running',
    'succeeded',
    'failed',
    'skipped',
    'cancelled',
    'timed_out',
  ]),
});
const ComputerUseProgressSchema = z
  .object({
    computerUseAction: z.enum([
      'drive.download_items',
      'drive.open_folder',
      'drive.select_items',
      'drive.verify_download',
      'excel.autofit_used_range',
      'excel.open_workbook',
      'excel.save_workbook',
      'excel.verify_active_workbook',
    ]),
  })
  .strict();
const DriveStepRowSchema = z
  .object({
    input_summary: z.record(z.string(), z.unknown()),
    output_summary: z.record(z.string(), z.unknown()),
    processed_file_count: z.number().int().nonnegative(),
    processed_row_count: z.number().int().nonnegative(),
    started_at: TimestampSchema.nullable(),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out']),
    updated_at: TimestampSchema,
  })
  .strict();
const AgentCloudStepRowSchema = z
  .object({
    input_summary: z.record(z.string(), z.unknown()),
    output_summary: z.record(z.string(), z.unknown()),
    processed_file_count: z.number().int().nonnegative(),
    processed_row_count: z.number().int().nonnegative(),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out']),
  })
  .strict();
const AgentCloudPredecessorStepRowSchema = z
  .object({
    node_id: z.string().min(1).max(120),
    node_type: z.string().min(1).max(120),
    output_summary: z.record(z.string(), z.unknown()),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out']),
  })
  .strict();
const DriveBatchLeaseSchema = z
  .object({
    claimId: UuidSchema,
    kind: z.literal('cloud_drive_batch_lease'),
    leaseUntil: TimestampSchema,
  })
  .strict();
const DRIVE_BATCH_LEASE_MS = 10 * 60_000;
const ApprovalRowSchema = z.object({
  created_at: TimestampSchema,
  expires_at: TimestampSchema.nullable(),
  id: UuidSchema,
  requested_by: UuidSchema,
  resolved_at: TimestampSchema.nullable(),
  resolved_by: UuidSchema.nullable(),
  risk_summary: z.unknown(),
  status: z.enum(['approved', 'expired', 'pending', 'rejected']),
});
const AuditRowSchema = z.object({
  action: z.string().min(1).max(160),
  actor_device_id: UuidSchema.nullable(),
  actor_user_id: UuidSchema.nullable(),
  created_at: TimestampSchema,
  id: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  metadata: z.record(z.string(), z.unknown()),
});
const NotificationRowSchema = z.object({
  created_at: TimestampSchema,
  id: UuidSchema,
  kind: z.enum(['approval', 'error', 'info', 'success']),
  message: z.string().min(1).max(500),
  read_at: TimestampSchema.nullable(),
  title: z.string().min(1).max(160),
});
const JobRowSchema = z.object({
  id: UuidSchema,
  status: z.enum(['pending', 'claimed', 'running', 'succeeded', 'failed', 'cancelled', 'expired']),
});
const DeviceRowSchema = z.object({
  agent_version: z.string().min(1).max(80).nullable(),
  id: UuidSchema,
  status: z.enum(['offline', 'online', 'pairing', 'revoked']),
});
const SystemMembershipSchema = z.object({
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
});
const SystemTenantSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(3).max(63),
});
const SystemProfileSchema = z
  .object({ display_name: z.string().min(1).max(120).nullable() })
  .nullable();
const SystemSubscriptionSchema = z
  .object({
    plan_code: z.enum(['free', 'pro', 'team', 'business']),
    status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'incomplete']),
  })
  .nullable();

function assertCanMutate(actor: RunActor): void {
  if (actor.role === 'viewer') {
    throw new RunOrchestrationError('RUN_FORBIDDEN', 'The tenant role cannot change runs.');
  }
}

function assertCanApprove(actor: RunActor): void {
  if (actor.role !== 'owner' && actor.role !== 'admin') {
    throw new RunOrchestrationError(
      'RUN_FORBIDDEN',
      'Only a tenant owner or administrator can resolve approvals.',
    );
  }
}

function auditUuid(value: number | string): string {
  const suffix = String(value).slice(-12).padStart(12, '0');
  return `00000000-0000-4000-8000-${suffix}`;
}

function safeAuditMetadata(
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, boolean | number | string>> {
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) =>
      typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string'
        ? [[key, value]]
        : [],
    ),
  );
}

async function versionRequiresApproval(
  tenantId: string,
  workflowVersionId: string,
  risk: ReturnType<typeof summarizeWorkflowRisks>,
): Promise<boolean> {
  const approvalNodes = [...risk.destructive, ...risk.external, ...risk.write];
  if (approvalNodes.some((node) => node.approvalMode === 'always')) {
    return true;
  }
  if (!approvalNodes.some((node) => node.approvalMode === 'first_run')) {
    return false;
  }
  const result = await createSupabaseAdminClient()
    .from('workflow_approvals')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('workflow_version_id', workflowVersionId)
    .eq('status', 'approved')
    .limit(1);
  if (result.error !== null) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The workflow approval history could not be checked.',
    );
  }
  return z.array(z.object({ id: UuidSchema })).parse(result.data).length === 0;
}

async function requireProductionTarget(
  tenantId: string,
  workflow: Workflow,
): Promise<{ readonly deviceId: string }> {
  if (workflow.executionTarget.type !== 'desktop') {
    throw new RunOrchestrationError(
      'RUN_INVALID',
      'Only a reviewed Desktop workflow can be dispatched to the Agent.',
    );
  }
  const admin = createSupabaseAdminClient();
  const deviceResult = await admin
    .from('devices')
    .select('id, status, agent_version')
    .eq('tenant_id', tenantId)
    .eq('id', workflow.executionTarget.deviceId)
    .neq('status', 'revoked')
    .maybeSingle();
  if (deviceResult.error !== null) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The Desktop Agent could not be read.');
  }
  if (deviceResult.data === null) {
    throw new RunOrchestrationError(
      'RUN_INVALID',
      'The selected Desktop Agent is unavailable or revoked.',
    );
  }
  const device = DeviceRowSchema.parse(deviceResult.data);
  if (!isAssistantAgentVersionCompatible(device.agent_version)) {
    throw new RunOrchestrationError(
      'RUN_INVALID',
      'Update the selected Desktop Agent before dispatching this workflow.',
    );
  }

  const folderAliasIds = [
    ...new Set(
      workflow.nodes.flatMap((node) => {
        const config = z
          .object({ folderAliasId: UuidSchema.optional() })
          .passthrough()
          .safeParse(node.config);
        return config.success && config.data.folderAliasId !== undefined
          ? [config.data.folderAliasId]
          : [];
      }),
    ),
  ];
  if (folderAliasIds.length > 0) {
    const aliasResult = await admin
      .from('folder_aliases')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('device_id', workflow.executionTarget.deviceId)
      .in('id', folderAliasIds);
    if (aliasResult.error !== null) {
      throw new RunOrchestrationError(
        'RUN_STATE_CONFLICT',
        'Approved folders could not be checked.',
      );
    }
    const allowed = new Set(
      z
        .array(z.object({ id: UuidSchema }))
        .parse(aliasResult.data)
        .map((row) => row.id),
    );
    if (folderAliasIds.some((id) => !allowed.has(id))) {
      throw new RunOrchestrationError(
        'RUN_INVALID',
        'The workflow references a folder that is not approved for this Desktop Agent.',
      );
    }
  }
  return { deviceId: workflow.executionTarget.deviceId };
}

async function transition(
  actor: RunActor | undefined,
  tenantId: string,
  runId: string,
  expected: z.infer<typeof RunRowSchema>['status'],
  next: z.infer<typeof RunRowSchema>['status'],
  options?: {
    readonly deviceId?: string;
    readonly errorCode?: string;
    readonly errorMessage?: string;
  },
): Promise<z.infer<typeof RunRowSchema>> {
  const result = await createSupabaseAdminClient().rpc('transition_workflow_run', {
    actor_device_id: options?.deviceId ?? null,
    actor_user_id: actor?.userId ?? null,
    expected_status: expected,
    next_status: next,
    target_error_code: options?.errorCode ?? null,
    target_error_message: options?.errorMessage ?? null,
    target_run_id: runId,
    target_tenant_id: tenantId,
  });
  if (result.error !== null) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The run state changed unexpectedly.');
  }
  return RunRowSchema.parse(result.data);
}

async function enqueueProductionJob(
  actor: RunActor | undefined,
  row: z.infer<typeof RunRowSchema>,
  workflow: Workflow,
  deviceId: string,
): Promise<string> {
  const admin = createSupabaseAdminClient();
  const nextAttempt = Math.max(1, row.attempt);
  const jobId = crypto.randomUUID();
  const jobResult = await admin
    .from('agent_jobs')
    .insert({
      attempt: 0,
      available_at: new Date().toISOString(),
      device_id: deviceId,
      id: jobId,
      idempotency_key: `${row.id}:desktop:${nextAttempt}`,
      max_attempts: 3,
      payload: { workflow },
      status: 'pending',
      tenant_id: row.tenant_id,
      workflow_run_id: row.id,
    })
    .select('id')
    .single();
  if (jobResult.error !== null) {
    await transition(actor, row.tenant_id, row.id, 'queued', 'cancelled');
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The Desktop Job could not be queued.');
  }
  const audit = await admin.from('audit_logs').insert({
    action: 'agent_job.queued',
    actor_user_id: actor?.userId ?? null,
    correlation_id: row.id,
    metadata: { attempt: nextAttempt, jobId },
    resource_id: row.id,
    resource_type: 'workflow_run',
    tenant_id: row.tenant_id,
  });
  if (audit.error !== null) {
    await admin
      .from('agent_jobs')
      .update({ completed_at: new Date().toISOString(), status: 'cancelled' })
      .eq('tenant_id', row.tenant_id)
      .eq('id', jobId);
    await transition(actor, row.tenant_id, row.id, 'queued', 'cancelled');
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The Desktop Job could not be audited.');
  }
  return jobId;
}

async function runView(tenantId: string, runId: string): Promise<WorkflowRunView> {
  const admin = createSupabaseAdminClient();
  const runResult = await admin
    .from('workflow_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', runId)
    .maybeSingle();
  if (runResult.error !== null) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The workflow run could not be read.');
  }
  if (runResult.data === null) {
    throw new RunOrchestrationError('RUN_NOT_FOUND', 'The workflow run was not found.');
  }
  const run = RunRowSchema.parse(runResult.data);
  const [
    workflowResult,
    versionResult,
    stepResult,
    approvalResult,
    auditResult,
    noticeResult,
    jobResult,
  ] = await Promise.all([
    admin
      .from('workflows')
      .select('id, tenant_id, name, execution_target')
      .eq('tenant_id', tenantId)
      .eq('id', run.workflow_id)
      .single(),
    admin
      .from('workflow_versions')
      .select('id, tenant_id, workflow_id, definition')
      .eq('tenant_id', tenantId)
      .eq('id', run.workflow_version_id)
      .single(),
    admin
      .from('workflow_run_steps')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('workflow_run_id', runId)
      .eq('attempt', Math.max(1, run.attempt))
      .order('created_at'),
    admin
      .from('workflow_approvals')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('workflow_run_id', runId)
      .maybeSingle(),
    admin
      .from('audit_logs')
      .select('id, action, actor_user_id, actor_device_id, metadata, created_at')
      .eq('tenant_id', tenantId)
      .eq('correlation_id', runId)
      .order('created_at'),
    admin
      .from('notifications')
      .select('id, kind, title, message, read_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('resource_type', 'workflow_run')
      .eq('resource_id', runId)
      .order('created_at'),
    admin
      .from('agent_jobs')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('workflow_run_id', runId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  if (
    workflowResult.error !== null ||
    versionResult.error !== null ||
    stepResult.error !== null ||
    approvalResult.error !== null ||
    auditResult.error !== null ||
    noticeResult.error !== null ||
    jobResult.error !== null
  ) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The workflow run view is incomplete.');
  }
  const workflowRow = WorkflowRowSchema.parse(workflowResult.data);
  const version = VersionRowSchema.parse(versionResult.data);
  const workflow = WorkflowSchema.parse(version.definition);
  if (
    workflowRow.id !== version.workflow_id ||
    workflowRow.tenant_id !== tenantId ||
    version.tenant_id !== tenantId ||
    workflow.executionTarget.type !== ExecutionTargetSchema.parse(workflowRow.execution_target).type
  ) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The workflow run target is invalid.');
  }
  const approval =
    approvalResult.data === null ? undefined : ApprovalRowSchema.parse(approvalResult.data);
  const latestJob = z.array(JobRowSchema).parse(jobResult.data)[0];
  const steps = z.array(StepRowSchema).parse(stepResult.data);
  const audits = z.array(AuditRowSchema).parse(auditResult.data);
  const notifications = z.array(NotificationRowSchema).parse(noticeResult.data);
  return WorkflowRunViewSchema.parse({
    ...(approval === undefined || approval.expires_at === null
      ? {}
      : {
          approval: {
            expiresAt: approval.expires_at,
            id: approval.id,
            requestedAt: approval.created_at,
            requestedBy: approval.requested_by,
            ...(approval.resolved_at === null ? {} : { resolvedAt: approval.resolved_at }),
            ...(approval.resolved_by === null ? {} : { resolvedBy: approval.resolved_by }),
            riskSummary: approval.risk_summary,
            status: approval.status,
          },
        }),
    attempts: run.attempt,
    audit: audits.map((audit) => ({
      action: audit.action,
      ...(audit.actor_device_id !== null
        ? { actorId: audit.actor_device_id, actorType: 'device' as const }
        : audit.actor_user_id !== null
          ? { actorId: audit.actor_user_id, actorType: 'user' as const }
          : { actorType: 'system' as const }),
      createdAt: audit.created_at,
      id: auditUuid(audit.id),
      metadata: safeAuditMetadata(audit.metadata),
    })),
    ...(run.completed_at === null ? {} : { completedAt: run.completed_at }),
    createdAt: run.created_at,
    ...(workflow.executionTarget.type === 'desktop'
      ? { deviceId: workflow.executionTarget.deviceId }
      : {}),
    ...(run.error_code === null
      ? {}
      : {
          error: {
            code: run.error_code,
            message: run.error_message ?? 'The workflow run did not complete.',
            retryable: run.status === 'failed' || run.status === 'timed_out',
          },
        }),
    id: run.id,
    idempotencyKey: run.idempotency_key,
    ...(latestJob === undefined ? {} : { jobId: latestJob.id }),
    maxAttempts: run.max_attempts,
    notifications: notifications.map((notice) => ({
      createdAt: notice.created_at,
      id: notice.id,
      kind: notice.kind,
      message: notice.message,
      read: notice.read_at !== null,
      title: notice.title,
    })),
    ...(run.started_at === null ? {} : { startedAt: run.started_at }),
    status: run.status === 'pending' ? 'queued' : run.status,
    steps: steps.map((step) => {
      const driveWorkbookProgress = driveWorkbookProgressForRunStep({
        nodeType: step.node_type,
        outputSummary: step.output_summary,
        status: step.status,
      });
      return {
        attempt: step.attempt,
        ...(step.completed_at === null ? {} : { completedAt: step.completed_at }),
        ...(step.error_code === null
          ? {}
          : {
              error: {
                code: step.error_code,
                message: step.error_message ?? 'The workflow step did not complete.',
                retryable: step.status === 'failed' || step.status === 'timed_out',
              },
            }),
        nodeId: step.node_id,
        nodeType: step.node_type,
        ...(ComputerUseProgressSchema.safeParse(step.output_summary).success
          ? {
              currentAction: ComputerUseProgressSchema.parse(step.output_summary).computerUseAction,
            }
          : {}),
        ...(driveWorkbookProgress === undefined ? {} : { driveWorkbookProgress }),
        ...(RunStepResultSchema.safeParse(step.output_summary).success
          ? { result: RunStepResultSchema.parse(step.output_summary) }
          : {}),
        processedFileCount: step.processed_file_count,
        processedRowCount: step.processed_row_count,
        ...(step.started_at === null ? {} : { startedAt: step.started_at }),
        status: step.status === 'timed_out' ? 'cancelled' : step.status,
      };
    }),
    tenantId,
    timeoutAt: run.timeout_at,
    workflowId: run.workflow_id,
    workflowName: workflowRow.name,
    workflowVersionId: run.workflow_version_id,
  });
}

async function findRunByIdempotency(
  tenantId: string,
  idempotencyKey: string,
): Promise<WorkflowRunView | undefined> {
  const result = await createSupabaseAdminClient()
    .from('workflow_runs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (result.error !== null) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The run could not be checked.');
  }
  const row = z.object({ id: UuidSchema }).safeParse(result.data);
  return row.success ? await runView(tenantId, row.data.id) : undefined;
}

export async function startProductionRun(
  actor: RunActor,
  inputValue: StartRunInput,
): Promise<RunStartResult> {
  assertCanMutate(actor);
  const input = z
    .object({
      deviceId: UuidSchema,
      idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/),
      maxAttempts: z.number().int().min(1).max(5).default(3),
      timeoutSeconds: z.number().int().min(30).max(86_400).default(1_800),
      workflow: WorkflowSchema,
      workflowId: UuidSchema,
      workflowVersionId: UuidSchema,
    })
    .strict()
    .parse(inputValue);
  const validation = validateWorkflow(input.workflow);
  if (!validation.success) {
    throw new RunOrchestrationError('RUN_INVALID', 'The workflow version is invalid.');
  }
  const target = await requireProductionTarget(actor.tenantId, input.workflow);
  if (target.deviceId !== input.deviceId) {
    throw new RunOrchestrationError(
      'RUN_INVALID',
      'The workflow target must match the selected Desktop Agent.',
    );
  }
  const existing = await findRunByIdempotency(actor.tenantId, input.idempotencyKey);
  if (existing !== undefined) {
    if (
      existing.workflowId !== input.workflowId ||
      existing.workflowVersionId !== input.workflowVersionId ||
      existing.deviceId !== input.deviceId
    ) {
      throw new RunOrchestrationError(
        'RUN_CONFLICT',
        'The run idempotency key is already bound to different input.',
      );
    }
    return { duplicate: true, run: existing };
  }

  const admin = createSupabaseAdminClient();
  const runId = crypto.randomUUID();
  const now = new Date();
  const risk = summarizeWorkflowRisks(input.workflow);
  const requiresApproval = await versionRequiresApproval(
    actor.tenantId,
    input.workflowVersionId,
    risk,
  );
  const insert = await admin
    .from('workflow_runs')
    .insert({
      id: runId,
      idempotency_key: input.idempotencyKey,
      max_attempts: input.maxAttempts,
      status: 'pending',
      tenant_id: actor.tenantId,
      timeout_at: new Date(now.getTime() + input.timeoutSeconds * 1_000).toISOString(),
      triggered_by: actor.userId,
      workflow_id: input.workflowId,
      workflow_version_id: input.workflowVersionId,
    })
    .select('*')
    .single();
  if (insert.error !== null) {
    const raced = await findRunByIdempotency(actor.tenantId, input.idempotencyKey);
    if (raced !== undefined) return { duplicate: true, run: raced };
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The workflow run could not be created.');
  }
  RunRowSchema.parse(insert.data);
  const stepInsert = await admin.from('workflow_run_steps').insert(
    input.workflow.nodes.map((node) => ({
      attempt: 1,
      node_id: node.id,
      node_type: node.type,
      status: 'pending',
      tenant_id: actor.tenantId,
      workflow_run_id: runId,
    })),
  );
  const auditInsert = await admin.from('audit_logs').insert({
    action: 'run.created',
    actor_user_id: actor.userId,
    correlation_id: runId,
    metadata: { requiresApproval },
    resource_id: runId,
    resource_type: 'workflow_run',
    tenant_id: actor.tenantId,
  });
  if (stepInsert.error !== null || auditInsert.error !== null) {
    await admin.from('workflow_runs').delete().eq('tenant_id', actor.tenantId).eq('id', runId);
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The workflow run could not be audited.');
  }
  if (requiresApproval) {
    const approvalId = crypto.randomUUID();
    const approvalInsert = await admin.from('workflow_approvals').insert({
      expires_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
      id: approvalId,
      requested_by: actor.userId,
      risk_summary: risk,
      status: 'pending',
      tenant_id: actor.tenantId,
      workflow_run_id: runId,
      workflow_version_id: input.workflowVersionId,
    });
    if (approvalInsert.error !== null) {
      await admin.from('workflow_runs').delete().eq('tenant_id', actor.tenantId).eq('id', runId);
      throw new RunOrchestrationError(
        'RUN_STATE_CONFLICT',
        'The workflow approval could not be created.',
      );
    }
    await transition(actor, actor.tenantId, runId, 'pending', 'awaiting_approval');
  } else {
    const queued = await transition(actor, actor.tenantId, runId, 'pending', 'queued');
    await enqueueProductionJob(actor, queued, input.workflow, input.deviceId);
  }
  return { duplicate: false, run: await runView(actor.tenantId, runId) };
}

function outputSummary(output: unknown): Readonly<Record<string, unknown>> {
  if (output !== null && typeof output === 'object' && !Array.isArray(output)) {
    return z.record(z.string(), z.unknown()).parse(output);
  }
  return { value: output ?? null };
}

type DriveBatchContinuation =
  | { readonly kind: 'busy' }
  | { readonly checkpoint: DriveExcelCheckpoint; readonly kind: 'pending' }
  | {
      readonly kind: 'completed';
      readonly output: NonNullable<
        Awaited<ReturnType<typeof advanceDriveExcelBatch>>['completedOutput']
      >;
    };

async function continueDriveExcelBatch(
  context: WorkspaceContext,
  run: z.infer<typeof RunRowSchema>,
  node: Workflow['nodes'][number],
): Promise<DriveBatchContinuation> {
  const admin = createSupabaseAdminClient();
  const attempt = Math.max(1, run.attempt);
  const selected = await admin
    .from('workflow_run_steps')
    .select(
      'input_summary, output_summary, processed_file_count, processed_row_count, started_at, status, updated_at',
    )
    .eq('tenant_id', context.actor.tenantId)
    .eq('workflow_run_id', run.id)
    .eq('node_id', node.id)
    .eq('attempt', attempt)
    .single();
  if (selected.error !== null) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The Drive Excel batch checkpoint could not be read.',
    );
  }
  const step = DriveStepRowSchema.parse(selected.data);
  if (step.status === 'succeeded') {
    return {
      kind: 'completed',
      output: DriveExcelFolderOutputSchema.parse(step.output_summary),
    };
  }
  if (step.status !== 'pending' && step.status !== 'running') {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The Drive Excel source step cannot be continued.',
    );
  }
  const existingLease = DriveBatchLeaseSchema.safeParse(step.input_summary);
  if (existingLease.success && new Date(existingLease.data.leaseUntil).getTime() > Date.now()) {
    return { kind: 'busy' };
  }
  const claimId = crypto.randomUUID();
  const claimedAt = new Date();
  const lease = DriveBatchLeaseSchema.parse({
    claimId,
    kind: 'cloud_drive_batch_lease',
    leaseUntil: new Date(claimedAt.getTime() + DRIVE_BATCH_LEASE_MS).toISOString(),
  });
  const claim = await admin
    .from('workflow_run_steps')
    .update({
      input_summary: lease,
      started_at: step.started_at ?? claimedAt.toISOString(),
      status: 'running',
      updated_at: claimedAt.toISOString(),
    })
    .eq('tenant_id', context.actor.tenantId)
    .eq('workflow_run_id', run.id)
    .eq('node_id', node.id)
    .eq('attempt', attempt)
    .eq('updated_at', step.updated_at)
    .in('status', ['pending', 'running'])
    .select('updated_at')
    .maybeSingle();
  if (claim.error !== null) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The Drive Excel batch lease could not be created.',
    );
  }
  if (claim.data === null) return { kind: 'busy' };

  const parsedCheckpoint = DriveExcelCheckpointSchema.safeParse(step.output_summary);
  const advanced = await advanceDriveExcelBatch(
    context,
    JsonValueSchema.parse(node.config),
    parsedCheckpoint.success ? parsedCheckpoint.data : undefined,
  );
  const savedAt = new Date().toISOString();
  const saved = await admin
    .from('workflow_run_steps')
    .update({
      input_summary: {},
      output_summary: advanced.checkpoint,
      processed_file_count: advanced.checkpoint.nextFileIndex,
      processed_row_count: advanced.checkpoint.rows.length,
      status: 'running',
      updated_at: savedAt,
    })
    .eq('tenant_id', context.actor.tenantId)
    .eq('workflow_run_id', run.id)
    .eq('node_id', node.id)
    .eq('attempt', attempt)
    .eq('input_summary->>claimId', claimId)
    .select('updated_at')
    .maybeSingle();
  if (saved.error !== null || saved.data === null) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The Drive Excel batch checkpoint changed before it could be saved.',
    );
  }
  await admin.from('audit_logs').insert({
    action: 'cloud_run.batch_completed',
    actor_user_id: context.actor.userId,
    correlation_id: run.id,
    metadata: {
      completedFiles: advanced.checkpoint.nextFileIndex,
      totalFiles: advanced.checkpoint.manifest.files.length,
    },
    resource_id: run.id,
    resource_type: 'workflow_run',
    tenant_id: context.actor.tenantId,
  });
  if (advanced.completedOutput === undefined) {
    return { checkpoint: advanced.checkpoint, kind: 'pending' };
  }
  return {
    kind: 'completed',
    output: advanced.completedOutput,
  };
}

async function executeQueuedCloudRun(
  context: WorkspaceContext,
  row: z.infer<typeof RunRowSchema>,
  workflow: Workflow,
  alreadyRunning = false,
): Promise<WorkflowRunView> {
  if (workflow.executionTarget.type !== 'cloud') {
    throw new RunOrchestrationError('RUN_INVALID', 'The workflow is not a cloud workflow.');
  }
  const actor = context.actor;
  const admin = createSupabaseAdminClient();
  let initialized = row;
  if (!alreadyRunning) {
    const initializedResult = await admin
      .from('workflow_runs')
      .update({ attempt: Math.max(1, row.attempt) })
      .eq('tenant_id', actor.tenantId)
      .eq('id', row.id)
      .eq('status', 'queued')
      .select('*')
      .single();
    if (initializedResult.error !== null) {
      throw new RunOrchestrationError(
        'RUN_STATE_CONFLICT',
        'The cloud workflow attempt could not be initialized.',
      );
    }
    initialized = RunRowSchema.parse(initializedResult.data);
    initialized = await transition(actor, actor.tenantId, row.id, 'queued', 'running');
  }
  try {
    const driveNodes = workflow.nodes.filter(
      (node) => node.type === 'google_drive.read_excel_folder',
    );
    if (driveNodes.length > 1) {
      throw new RunOrchestrationError(
        'RUN_INVALID',
        'A resumable cloud workflow may contain only one Drive Excel source.',
      );
    }
    let completedNodeOutputs: Readonly<Record<string, JsonValue>> | undefined;
    const driveNode = driveNodes[0];
    if (driveNode !== undefined) {
      const continuation = await continueDriveExcelBatch(context, initialized, driveNode);
      if (continuation.kind === 'busy' || continuation.kind === 'pending') {
        return await runView(actor.tenantId, row.id);
      }
      completedNodeOutputs = {
        [driveNode.id]: JsonValueSchema.parse(continuation.output),
      };
    }
    const result = await executeCloudWorkflow(context, workflow, {
      ...(completedNodeOutputs === undefined ? {} : { completedNodeOutputs }),
      idempotencyKey: row.idempotency_key,
      async onProgress(event) {
        if (event.status !== 'running') return;
        await admin
          .from('workflow_run_steps')
          .update({ started_at: new Date().toISOString(), status: 'running' })
          .eq('tenant_id', actor.tenantId)
          .eq('workflow_run_id', row.id)
          .eq('node_id', event.nodeId)
          .eq('attempt', Math.max(1, initialized.attempt));
      },
      runId: row.id,
    });
    for (const step of result.steps) {
      const update = await admin
        .from('workflow_run_steps')
        .update({
          completed_at: step.completedAt,
          error_code: step.error?.code ?? null,
          error_message: step.error?.message ?? null,
          output_summary: outputSummary(step.output),
          processed_file_count: step.metrics.processedFileCount ?? 0,
          processed_row_count: step.metrics.processedRowCount ?? 0,
          started_at: step.startedAt,
          status: step.status,
          updated_at: step.completedAt,
        })
        .eq('tenant_id', actor.tenantId)
        .eq('workflow_run_id', row.id)
        .eq('node_id', step.nodeId)
        .eq('attempt', Math.max(1, initialized.attempt));
      if (update.error !== null) {
        throw new RunOrchestrationError(
          'RUN_STATE_CONFLICT',
          'A cloud workflow step result could not be saved.',
        );
      }
    }
    if (result.status === 'succeeded') {
      await transition(actor, actor.tenantId, row.id, 'running', 'succeeded');
      await admin.from('notifications').insert({
        kind: 'success',
        message: 'The cloud workflow completed all validated steps.',
        resource_id: row.id,
        resource_type: 'workflow_run',
        tenant_id: actor.tenantId,
        title: 'Cloud workflow completed',
        user_id: actor.userId,
      });
    } else {
      const failed = result.steps.find(
        (step) => step.status === 'failed' || step.status === 'timed_out',
      );
      await transition(actor, actor.tenantId, row.id, 'running', 'failed', {
        errorCode: failed?.error?.code ?? 'CLOUD_WORKFLOW_FAILED',
        errorMessage: failed?.error?.message ?? 'The cloud workflow did not complete.',
      });
    }
    await admin.from('audit_logs').insert({
      action: `cloud_run.${result.status}`,
      actor_user_id: actor.userId,
      correlation_id: row.id,
      metadata: { completedSteps: result.steps.length },
      resource_id: row.id,
      resource_type: 'workflow_run',
      tenant_id: actor.tenantId,
    });
    return await runView(actor.tenantId, row.id);
  } catch (error) {
    const current = await runView(actor.tenantId, row.id);
    if (current.status === 'running') {
      await transition(actor, actor.tenantId, row.id, 'running', 'failed', {
        errorCode: 'CLOUD_WORKFLOW_FAILED',
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'The cloud workflow could not be completed.',
      });
    }
    throw error;
  }
}

export async function startProductionCloudRun(
  context: WorkspaceContext,
  inputValue: {
    readonly idempotencyKey: string;
    readonly maxAttempts?: number;
    readonly timeoutSeconds?: number;
    readonly workflow: Workflow;
    readonly workflowId: string;
    readonly workflowVersionId: string;
  },
): Promise<RunStartResult> {
  const actor = context.actor;
  assertCanMutate(actor);
  const input = z
    .object({
      idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/),
      maxAttempts: z.number().int().min(1).max(5).default(2),
      timeoutSeconds: z.number().int().min(30).max(86_400).default(1_800),
      workflow: WorkflowSchema,
      workflowId: UuidSchema,
      workflowVersionId: UuidSchema,
    })
    .strict()
    .parse(inputValue);
  const validation = validateWorkflow(input.workflow);
  if (!validation.success || input.workflow.executionTarget.type !== 'cloud') {
    throw new RunOrchestrationError('RUN_INVALID', 'The cloud workflow version is invalid.');
  }
  const existing = await findRunByIdempotency(actor.tenantId, input.idempotencyKey);
  if (existing !== undefined) {
    if (
      existing.workflowId !== input.workflowId ||
      existing.workflowVersionId !== input.workflowVersionId ||
      existing.deviceId !== undefined
    ) {
      throw new RunOrchestrationError(
        'RUN_CONFLICT',
        'The run idempotency key is already bound to different input.',
      );
    }
    return { duplicate: true, run: existing };
  }
  const admin = createSupabaseAdminClient();
  const runId = crypto.randomUUID();
  const now = new Date();
  const risk = summarizeWorkflowRisks(input.workflow);
  const requiresApproval = await versionRequiresApproval(
    actor.tenantId,
    input.workflowVersionId,
    risk,
  );
  const insert = await admin
    .from('workflow_runs')
    .insert({
      id: runId,
      idempotency_key: input.idempotencyKey,
      max_attempts: input.maxAttempts,
      status: 'pending',
      tenant_id: actor.tenantId,
      timeout_at: new Date(now.getTime() + input.timeoutSeconds * 1_000).toISOString(),
      triggered_by: actor.userId,
      workflow_id: input.workflowId,
      workflow_version_id: input.workflowVersionId,
    })
    .select('*')
    .single();
  if (insert.error !== null) {
    const raced = await findRunByIdempotency(actor.tenantId, input.idempotencyKey);
    if (raced !== undefined) return { duplicate: true, run: raced };
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The cloud run could not be created.');
  }
  RunRowSchema.parse(insert.data);
  const [stepInsert, auditInsert] = await Promise.all([
    admin.from('workflow_run_steps').insert(
      input.workflow.nodes.map((node) => ({
        attempt: 1,
        node_id: node.id,
        node_type: node.type,
        status: 'pending',
        tenant_id: actor.tenantId,
        workflow_run_id: runId,
      })),
    ),
    admin.from('audit_logs').insert({
      action: 'cloud_run.created',
      actor_user_id: actor.userId,
      correlation_id: runId,
      metadata: { requiresApproval },
      resource_id: runId,
      resource_type: 'workflow_run',
      tenant_id: actor.tenantId,
    }),
  ]);
  if (stepInsert.error !== null || auditInsert.error !== null) {
    await admin.from('workflow_runs').delete().eq('tenant_id', actor.tenantId).eq('id', runId);
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The cloud run could not be audited.');
  }
  if (requiresApproval) {
    const approvalInsert = await admin.from('workflow_approvals').insert({
      expires_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
      id: crypto.randomUUID(),
      requested_by: actor.userId,
      risk_summary: risk,
      status: 'pending',
      tenant_id: actor.tenantId,
      workflow_run_id: runId,
      workflow_version_id: input.workflowVersionId,
    });
    if (approvalInsert.error !== null) {
      await admin.from('workflow_runs').delete().eq('tenant_id', actor.tenantId).eq('id', runId);
      throw new RunOrchestrationError(
        'RUN_STATE_CONFLICT',
        'The cloud run approval could not be created.',
      );
    }
    await transition(actor, actor.tenantId, runId, 'pending', 'awaiting_approval');
    return { duplicate: false, run: await runView(actor.tenantId, runId) };
  }
  const queued = await transition(actor, actor.tenantId, runId, 'pending', 'queued');
  return { duplicate: false, run: await executeQueuedCloudRun(context, queued, input.workflow) };
}

export async function listProductionRuns(actor: RunActor): Promise<readonly WorkflowRunView[]> {
  await sweepProductionRuns(actor);
  const result = await createSupabaseAdminClient()
    .from('workflow_runs')
    .select('id')
    .eq('tenant_id', actor.tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (result.error !== null) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'Workflow runs could not be listed.');
  }
  const rows = z.array(z.object({ id: UuidSchema })).parse(result.data);
  return await Promise.all(rows.map(async (row) => await runView(actor.tenantId, row.id)));
}

export async function getProductionRun(actor: RunActor, runId: string): Promise<WorkflowRunView> {
  UuidSchema.parse(runId);
  await sweepProductionRuns(actor, runId);
  return await runView(actor.tenantId, runId);
}

export async function resolveProductionRunApproval(
  context: WorkspaceContext,
  runIdInput: string,
  approvalIdInput: string,
  decision: 'approve' | 'reject',
): Promise<WorkflowRunView> {
  const actor = context.actor;
  assertCanApprove(actor);
  const runId = UuidSchema.parse(runIdInput);
  const approvalId = UuidSchema.parse(approvalIdInput);
  const admin = createSupabaseAdminClient();
  const view = await runView(actor.tenantId, runId);
  if (
    view.status !== 'awaiting_approval' ||
    view.approval?.id !== approvalId ||
    view.approval.status !== 'pending'
  ) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The run does not have this pending approval.',
    );
  }
  if (new Date(view.approval.expiresAt).getTime() <= Date.now()) {
    await admin
      .from('workflow_approvals')
      .update({ resolved_at: new Date().toISOString(), status: 'expired' })
      .eq('tenant_id', actor.tenantId)
      .eq('id', approvalId)
      .eq('status', 'pending');
    await transition(actor, actor.tenantId, runId, 'awaiting_approval', 'timed_out');
    throw new RunOrchestrationError('RUN_APPROVAL_EXPIRED', 'The run approval has expired.');
  }
  const resolvedAt = new Date().toISOString();
  const approvalUpdate = await admin
    .from('workflow_approvals')
    .update({
      resolved_at: resolvedAt,
      resolved_by: actor.userId,
      status: decision === 'approve' ? 'approved' : 'rejected',
    })
    .eq('tenant_id', actor.tenantId)
    .eq('id', approvalId)
    .eq('status', 'pending')
    .select('id');
  if (
    approvalUpdate.error !== null ||
    z.array(z.object({ id: UuidSchema })).parse(approvalUpdate.data).length !== 1
  ) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The approval was already resolved.');
  }
  if (decision === 'reject') {
    await transition(actor, actor.tenantId, runId, 'awaiting_approval', 'cancelled');
    return await runView(actor.tenantId, runId);
  }
  const queued = await transition(actor, actor.tenantId, runId, 'awaiting_approval', 'queued');
  const versionResult = await admin
    .from('workflow_versions')
    .select('definition')
    .eq('tenant_id', actor.tenantId)
    .eq('id', queued.workflow_version_id)
    .single();
  if (versionResult.error !== null) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The approved workflow is unavailable.');
  }
  const workflow = WorkflowSchema.parse(
    z.object({ definition: z.unknown() }).parse(versionResult.data).definition,
  );
  if (workflow.executionTarget.type === 'cloud') {
    const attemptUpdate = await admin
      .from('workflow_runs')
      .update({ attempt: Math.max(1, queued.attempt) })
      .eq('tenant_id', actor.tenantId)
      .eq('id', runId)
      .select('*')
      .single();
    if (attemptUpdate.error !== null) {
      await transition(actor, actor.tenantId, runId, 'queued', 'cancelled');
      throw new RunOrchestrationError(
        'RUN_STATE_CONFLICT',
        'The approved cloud workflow attempt could not be initialized.',
      );
    }
    return await executeQueuedCloudRun(context, RunRowSchema.parse(attemptUpdate.data), workflow);
  }
  const target = await requireProductionTarget(actor.tenantId, workflow);
  const attemptUpdate = await admin
    .from('workflow_runs')
    .update({ attempt: Math.max(1, queued.attempt) })
    .eq('tenant_id', actor.tenantId)
    .eq('id', runId)
    .select('*')
    .single();
  if (attemptUpdate.error !== null) {
    await transition(actor, actor.tenantId, runId, 'queued', 'cancelled');
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The approved workflow attempt could not be initialized.',
    );
  }
  const initialized = RunRowSchema.parse(attemptUpdate.data);
  await enqueueProductionJob(actor, initialized, workflow, target.deviceId);
  return await runView(actor.tenantId, runId);
}

export async function cancelProductionRun(
  actor: RunActor,
  runIdInput: string,
): Promise<WorkflowRunView> {
  assertCanMutate(actor);
  const view = await runView(actor.tenantId, UuidSchema.parse(runIdInput));
  if (!['awaiting_approval', 'queued', 'running'].includes(view.status)) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'Only an active run can be cancelled.');
  }
  await transition(actor, actor.tenantId, view.id, view.status, 'cancelled');
  return await runView(actor.tenantId, view.id);
}

export async function retryProductionRun(
  context: WorkspaceContext,
  runIdInput: string,
): Promise<WorkflowRunView> {
  const actor = context.actor;
  assertCanMutate(actor);
  const view = await runView(actor.tenantId, UuidSchema.parse(runIdInput));
  if (
    (view.status !== 'failed' && view.status !== 'timed_out') ||
    view.attempts >= view.maxAttempts
  ) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The run cannot be retried in its current state.',
    );
  }
  const transitioned = await transition(actor, actor.tenantId, view.id, view.status, 'queued');
  const admin = createSupabaseAdminClient();
  const timeoutUpdate = await admin
    .from('workflow_runs')
    .update({ timeout_at: nextRetryTimeoutAt(view) })
    .eq('tenant_id', actor.tenantId)
    .eq('id', view.id)
    .eq('status', 'queued')
    .select('*')
    .single();
  if (timeoutUpdate.error !== null) {
    await transition(actor, actor.tenantId, view.id, 'queued', 'cancelled');
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The retried workflow timeout could not be initialized.',
    );
  }
  const queued = RunRowSchema.parse(timeoutUpdate.data);
  if (queued.attempt !== transitioned.attempt) {
    await transition(actor, actor.tenantId, view.id, 'queued', 'cancelled');
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The retried run attempt changed.');
  }
  const versionResult = await admin
    .from('workflow_versions')
    .select('definition')
    .eq('tenant_id', actor.tenantId)
    .eq('id', view.workflowVersionId)
    .single();
  if (versionResult.error !== null) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The workflow version is unavailable.');
  }
  const workflow = WorkflowSchema.parse(
    z.object({ definition: z.unknown() }).parse(versionResult.data).definition,
  );
  const stepInsert = await admin.from('workflow_run_steps').insert(
    workflow.nodes.map((node) => ({
      attempt: queued.attempt,
      node_id: node.id,
      node_type: node.type,
      status: 'pending',
      tenant_id: actor.tenantId,
      workflow_run_id: view.id,
    })),
  );
  if (stepInsert.error !== null) {
    await transition(actor, actor.tenantId, view.id, 'queued', 'cancelled');
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The retried workflow steps could not be initialized.',
    );
  }
  if (workflow.executionTarget.type === 'cloud') {
    return await executeQueuedCloudRun(context, queued, workflow);
  }
  const target = await requireProductionTarget(actor.tenantId, workflow);
  await enqueueProductionJob(actor, queued, workflow, target.deviceId);
  return await runView(actor.tenantId, view.id);
}

export async function syncProductionAgentProgress(
  input: AgentProgressInput & { readonly workflow: Workflow },
): Promise<void> {
  const parsed = z
    .object({
      deviceId: UuidSchema,
      eventId: UuidSchema,
      jobId: UuidSchema,
      step: StepResultSchema,
      tenantId: UuidSchema,
      workflow: WorkflowSchema,
    })
    .strict()
    .parse(input);
  const admin = createSupabaseAdminClient();
  const jobResult = await admin
    .from('agent_jobs')
    .select('workflow_run_id, attempt')
    .eq('tenant_id', parsed.tenantId)
    .eq('device_id', parsed.deviceId)
    .eq('id', parsed.jobId)
    .single();
  if (jobResult.error !== null) return;
  const job = z
    .object({ attempt: z.number().int().min(1), workflow_run_id: UuidSchema })
    .parse(jobResult.data);
  const run = await runView(parsed.tenantId, job.workflow_run_id);
  const workflowNode = parsed.workflow.nodes.find((node) => node.id === parsed.step.nodeId);
  const runStep = run.steps.find((step) => step.nodeId === parsed.step.nodeId);
  if (
    workflowNode === undefined ||
    runStep === undefined ||
    runStep.nodeType !== workflowNode.type
  ) {
    throw new RunOrchestrationError('RUN_INVALID', 'The progress node is not in this run.');
  }
  if (isAgentCloudNodeType(workflowNode.type)) {
    // The reviewed cloud-step endpoint is the sole owner of cloud step state.
    return;
  }
  if (run.status === 'queued') {
    await transition(undefined, parsed.tenantId, run.id, 'queued', 'running', {
      deviceId: parsed.deviceId,
    });
  }
  const safeStep = StepResultSchema.parse(parsed.step);
  const computerUseProgress = ComputerUseProgressSchema.safeParse(safeStep.output);
  const workbookBatchProgress =
    safeStep.status === 'running' &&
    workflowNode.type === 'excel.read' &&
    safeStep.progress !== undefined
      ? safeStep.progress
      : undefined;
  const isAiSummaryPredecessor = parsed.workflow.edges.some((edge) => {
    if (edge.from !== safeStep.nodeId) return false;
    return parsed.workflow.nodes.some(
      (node) => node.id === edge.to && node.type === 'ai.summarize',
    );
  });
  const safeProfile =
    safeStep.status === 'succeeded' && isAiSummaryPredecessor && safeStep.output !== undefined
      ? validateDesktopExcelProfile(safeStep.output)
      : undefined;
  const update = await admin
    .from('workflow_run_steps')
    .update({
      completed_at: safeStep.completedAt ?? null,
      error_code: safeStep.error?.code ?? null,
      error_message: safeStep.error?.message ?? null,
      output_summary:
        safeStep.status === 'running' && computerUseProgress.success
          ? computerUseProgress.data
          : (workbookBatchProgress ?? safeProfile ?? {}),
      processed_file_count: safeStep.processedFileCount,
      processed_row_count: safeStep.processedRowCount,
      started_at: safeStep.startedAt ?? null,
      status: safeStep.status,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', parsed.tenantId)
    .eq('workflow_run_id', run.id)
    .eq('node_id', safeStep.nodeId)
    .eq('attempt', Math.max(1, run.attempts))
    .select('id');
  if (
    update.error !== null ||
    z.array(z.object({ id: UuidSchema })).parse(update.data).length !== 1
  ) {
    throw new RunOrchestrationError('RUN_INVALID', 'The progress node is not in this run.');
  }
}

export async function syncProductionAgentCompletion(input: AgentCompletionInput): Promise<void> {
  const parsed = z
    .object({
      deviceId: UuidSchema,
      eventId: UuidSchema,
      jobId: UuidSchema,
      tenantId: UuidSchema,
    })
    .strict()
    .parse(input);
  const admin = createSupabaseAdminClient();
  const jobResult = await admin
    .from('agent_jobs')
    .select('workflow_run_id')
    .eq('tenant_id', parsed.tenantId)
    .eq('device_id', parsed.deviceId)
    .eq('id', parsed.jobId)
    .single();
  if (jobResult.error !== null) return;
  const runId = z.object({ workflow_run_id: UuidSchema }).parse(jobResult.data).workflow_run_id;
  let run = await runView(parsed.tenantId, runId);
  if (run.status === 'queued') {
    await transition(undefined, parsed.tenantId, run.id, 'queued', 'running', {
      deviceId: parsed.deviceId,
    });
    run = await runView(parsed.tenantId, run.id);
  }
  if (run.status === 'succeeded') return;
  if (run.status !== 'running') {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The run cannot be completed.');
  }
  const unfinished = run.steps.filter(
    (step) => step.status !== 'succeeded' && step.status !== 'skipped',
  );
  if (unfinished.length > 0) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The run still has unfinished workflow steps.',
    );
  }
  await transition(undefined, parsed.tenantId, run.id, 'running', 'succeeded', {
    deviceId: parsed.deviceId,
  });
}

export async function syncProductionAgentFailure(input: AgentFailureInput): Promise<void> {
  const parsed = z
    .object({
      deviceId: UuidSchema,
      error: z
        .object({
          code: z.string().min(1).max(120),
          message: z.string().min(1).max(500),
          retryable: z.boolean(),
        })
        .strict(),
      eventId: UuidSchema,
      jobId: UuidSchema,
      tenantId: UuidSchema,
    })
    .strict()
    .parse(input);
  const admin = createSupabaseAdminClient();
  const jobResult = await admin
    .from('agent_jobs')
    .select('workflow_run_id')
    .eq('tenant_id', parsed.tenantId)
    .eq('device_id', parsed.deviceId)
    .eq('id', parsed.jobId)
    .single();
  if (jobResult.error !== null) return;
  const runId = z.object({ workflow_run_id: UuidSchema }).parse(jobResult.data).workflow_run_id;
  let run = await runView(parsed.tenantId, runId);
  if (run.status === 'queued') {
    await transition(undefined, parsed.tenantId, run.id, 'queued', 'running', {
      deviceId: parsed.deviceId,
    });
    run = await runView(parsed.tenantId, run.id);
  }
  if (run.status === 'failed') return;
  if (run.status !== 'running') {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The run cannot be failed.');
  }
  await transition(undefined, parsed.tenantId, run.id, 'running', 'failed', {
    deviceId: parsed.deviceId,
    errorCode: parsed.error.code,
    errorMessage: parsed.error.message,
  });
}

async function systemWorkspaceContextForRun(
  run: z.infer<typeof RunRowSchema>,
): Promise<WorkspaceContext> {
  if (run.triggered_by === null) {
    throw new RunOrchestrationError(
      'RUN_FORBIDDEN',
      'The resumable cloud workflow has no authorized owner.',
    );
  }
  const admin = createSupabaseAdminClient();
  const [membership, tenant, profile, subscription, platformAdmin] = await Promise.all([
    admin
      .from('memberships')
      .select('role')
      .eq('tenant_id', run.tenant_id)
      .eq('user_id', run.triggered_by)
      .maybeSingle(),
    admin.from('tenants').select('id, name, slug').eq('id', run.tenant_id).single(),
    admin.from('profiles').select('display_name').eq('id', run.triggered_by).maybeSingle(),
    admin
      .from('tenant_subscriptions')
      .select('plan_code, status')
      .eq('tenant_id', run.tenant_id)
      .maybeSingle(),
    admin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', run.triggered_by)
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
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The resumable cloud workflow owner could not be verified.',
    );
  }
  const parsedMembership = SystemMembershipSchema.safeParse(membership.data);
  const parsedTenant = SystemTenantSchema.safeParse(tenant.data);
  const parsedProfile = SystemProfileSchema.safeParse(profile.data);
  const parsedSubscription = SystemSubscriptionSchema.safeParse(subscription.data);
  if (
    !parsedMembership.success ||
    !parsedTenant.success ||
    !parsedProfile.success ||
    !parsedSubscription.success
  ) {
    throw new RunOrchestrationError(
      'RUN_FORBIDDEN',
      'The resumable cloud workflow owner is no longer authorized.',
    );
  }
  return {
    actor: {
      role: parsedMembership.data.role,
      tenantId: run.tenant_id,
      userId: run.triggered_by,
    },
    displayName: parsedProfile.data?.display_name ?? 'Workflow owner',
    platformAdmin: platformAdmin.data !== null,
    subscription: {
      plan: parsedSubscription.data?.plan_code ?? 'free',
      status: parsedSubscription.data?.status ?? 'incomplete',
    },
    tenant: parsedTenant.data,
  };
}

export async function executeProductionAgentCloudStep(
  job: AgentJob,
  node: AgentCloudNode,
  inputValue: JsonValue,
  signal?: AbortSignal,
): Promise<{
  readonly duplicate: boolean;
  readonly output: JsonValue;
  readonly processedFileCount: number;
  readonly processedRowCount: number;
}> {
  if (getEnvironment().mockMode) {
    throw new RunOrchestrationError(
      'RUN_INVALID',
      'Desktop-to-Cloud continuation requires an authenticated production workspace.',
    );
  }
  const input = JsonValueSchema.parse(inputValue);
  const inputHash = agentCloudInputHash(input);
  const admin = createSupabaseAdminClient();
  const runResult = await admin
    .from('workflow_runs')
    .select('*')
    .eq('tenant_id', job.tenantId)
    .eq('id', job.workflowRunId)
    .in('status', ['queued', 'running'])
    .single();
  if (runResult.error !== null) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The approved Desktop run is unavailable for cloud continuation.',
    );
  }
  const run = RunRowSchema.parse(runResult.data);
  const attempt = Math.max(1, run.attempt);
  const stepResult = await admin
    .from('workflow_run_steps')
    .select('input_summary, output_summary, processed_file_count, processed_row_count, status')
    .eq('tenant_id', job.tenantId)
    .eq('workflow_run_id', job.workflowRunId)
    .eq('node_id', node.id)
    .eq('node_type', node.type)
    .eq('attempt', attempt)
    .single();
  if (stepResult.error !== null) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The approved cloud continuation step is unavailable.',
    );
  }
  const step = AgentCloudStepRowSchema.parse(stepResult.data);
  const disposition = agentCloudClaimDisposition(
    { inputSummary: step.input_summary, status: step.status },
    inputHash,
  );
  if (disposition === 'duplicate') {
    return {
      duplicate: true,
      output: JsonValueSchema.parse(step.output_summary),
      processedFileCount: step.processed_file_count,
      processedRowCount: step.processed_row_count,
    };
  }
  if (disposition === 'input_conflict') {
    throw new RunOrchestrationError(
      'RUN_CONFLICT',
      'The cloud continuation input changed after execution began.',
    );
  }
  if (disposition !== 'claim') {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      disposition === 'in_progress'
        ? 'The cloud continuation step is already in progress.'
        : 'The cloud continuation step is not claimable.',
    );
  }

  let predecessor: ReturnType<typeof immediateAgentCloudPredecessor>;
  try {
    predecessor = immediateAgentCloudPredecessor(job.workflow, node.id);
  } catch (error) {
    throw new RunOrchestrationError(
      'RUN_INVALID',
      'The reviewed cloud continuation graph has an invalid predecessor.',
      { cause: error },
    );
  }
  const predecessorResult = await admin
    .from('workflow_run_steps')
    .select('node_id, node_type, output_summary, status')
    .eq('tenant_id', job.tenantId)
    .eq('workflow_run_id', job.workflowRunId)
    .eq('node_id', predecessor.id)
    .eq('node_type', predecessor.type)
    .eq('attempt', attempt)
    .single();
  if (predecessorResult.error !== null) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The cloud continuation predecessor is unavailable.',
    );
  }
  const predecessorStep = AgentCloudPredecessorStepRowSchema.parse(predecessorResult.data);
  if (predecessorStep.status !== 'succeeded') {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The cloud continuation predecessor has not succeeded.',
    );
  }
  if (!agentCloudInputsEqual(input, predecessorStep.output_summary)) {
    throw new RunOrchestrationError(
      'RUN_CONFLICT',
      'The cloud continuation input does not match the stored predecessor output.',
    );
  }

  const startedAt = new Date().toISOString();
  const claimed = await admin.rpc('claim_agent_cloud_step', {
    requested_attempt: attempt,
    requested_input: input,
    requested_input_hash: inputHash,
    requested_node_id: node.id,
    requested_node_type: node.type,
    requested_predecessor_node_id: predecessor.id,
    requested_predecessor_node_type: predecessor.type,
    requested_run_id: job.workflowRunId,
    requested_started_at: startedAt,
    requested_tenant_id: job.tenantId,
  });
  if (
    claimed.error !== null ||
    z.array(z.object({ id: UuidSchema })).parse(claimed.data).length !== 1
  ) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The cloud continuation step could not be claimed.',
    );
  }
  try {
    const context = await systemWorkspaceContextForRun(run);
    const executed = await executeCloudWorkflowNode(context, node, input, {
      idempotencyKey: `${job.idempotencyKey}:${node.id}`,
      runId: job.workflowRunId,
      ...(signal === undefined ? {} : { signal }),
    });
    const output = z.record(z.string(), z.unknown()).parse(JsonValueSchema.parse(executed.output));
    const processedFileCount = executed.metrics?.processedFileCount ?? 0;
    const processedRowCount = executed.metrics?.processedRowCount ?? 0;
    const completedAt = new Date().toISOString();
    const saved = await admin
      .from('workflow_run_steps')
      .update({
        completed_at: completedAt,
        output_summary: output,
        processed_file_count: processedFileCount,
        processed_row_count: processedRowCount,
        status: 'succeeded',
        updated_at: completedAt,
      })
      .eq('tenant_id', job.tenantId)
      .eq('workflow_run_id', job.workflowRunId)
      .eq('node_id', node.id)
      .eq('node_type', node.type)
      .eq('attempt', attempt)
      .eq('status', 'running')
      .eq('input_summary->>agentCloudInputHash', inputHash)
      .select('id');
    if (
      saved.error !== null ||
      z.array(z.object({ id: UuidSchema })).parse(saved.data).length !== 1
    ) {
      throw new RunOrchestrationError(
        'RUN_STATE_CONFLICT',
        'The cloud continuation result could not be saved.',
      );
    }
    try {
      await admin.from('audit_logs').insert({
        action: 'agent_cloud_step.succeeded',
        actor_device_id: job.deviceId,
        correlation_id: job.workflowRunId,
        metadata: { nodeType: node.type },
        resource_id: job.workflowRunId,
        resource_type: 'workflow_run',
        tenant_id: job.tenantId,
      });
    } catch {
      // The durable succeeded step remains authoritative if audit delivery is unavailable.
    }
    return {
      duplicate: false,
      output: JsonValueSchema.parse(output),
      processedFileCount,
      processedRowCount,
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const errorCode = signal?.aborted ? 'AGENT_CLOUD_STEP_ABORTED' : 'AGENT_CLOUD_STEP_FAILED';
    const errorMessage = signal?.aborted
      ? 'The reviewed cloud continuation step was interrupted.'
      : 'The reviewed cloud continuation step could not be completed.';
    try {
      const failed = await admin
        .from('workflow_run_steps')
        .update({
          completed_at: failedAt,
          error_code: errorCode,
          error_message: errorMessage,
          output_summary: {},
          status: 'failed',
          updated_at: failedAt,
        })
        .eq('tenant_id', job.tenantId)
        .eq('workflow_run_id', job.workflowRunId)
        .eq('node_id', node.id)
        .eq('node_type', node.type)
        .eq('attempt', attempt)
        .eq('status', 'running')
        .eq('input_summary->>agentCloudInputHash', inputHash)
        .select('id');
      if (
        failed.error === null &&
        z.array(z.object({ id: UuidSchema })).parse(failed.data).length === 1
      ) {
        await admin.from('audit_logs').insert({
          action: 'agent_cloud_step.failed',
          actor_device_id: job.deviceId,
          correlation_id: job.workflowRunId,
          metadata: { errorCode, nodeType: node.type },
          resource_id: job.workflowRunId,
          resource_type: 'workflow_run',
          tenant_id: job.tenantId,
        });
      }
    } catch {
      // Preserve the originating execution error if failure bookkeeping is unavailable.
    }
    throw error;
  }
}

export interface CloudBatchTickResult {
  readonly continuedCount: number;
  readonly failedCount: number;
  readonly inspectedCount: number;
}

export async function resumeProductionCloudRuns(
  at = new Date(),
  limit = 1,
): Promise<CloudBatchTickResult> {
  if (getEnvironment().mockMode) {
    return { continuedCount: 0, failedCount: 0, inspectedCount: 0 };
  }
  const parsedLimit = z.number().int().min(1).max(5).parse(limit);
  const admin = createSupabaseAdminClient();
  const candidates = await admin
    .from('workflow_run_steps')
    .select('tenant_id, workflow_run_id')
    .eq('node_type', 'google_drive.read_excel_folder')
    .in('status', ['running', 'succeeded'])
    .order('updated_at')
    .limit(parsedLimit);
  if (candidates.error !== null) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'Resumable cloud workflow batches could not be listed.',
    );
  }
  const rows = z
    .array(z.object({ tenant_id: UuidSchema, workflow_run_id: UuidSchema }))
    .parse(candidates.data);
  let continuedCount = 0;
  let failedCount = 0;
  for (const candidate of rows) {
    try {
      const runResult = await admin
        .from('workflow_runs')
        .select('*')
        .eq('tenant_id', candidate.tenant_id)
        .eq('id', candidate.workflow_run_id)
        .eq('status', 'running')
        .gt('timeout_at', at.toISOString())
        .maybeSingle();
      if (runResult.error !== null || runResult.data === null) continue;
      const run = RunRowSchema.parse(runResult.data);
      const versionResult = await admin
        .from('workflow_versions')
        .select('definition')
        .eq('tenant_id', run.tenant_id)
        .eq('id', run.workflow_version_id)
        .single();
      if (versionResult.error !== null) {
        throw new RunOrchestrationError(
          'RUN_STATE_CONFLICT',
          'The resumable cloud workflow version could not be read.',
        );
      }
      const workflow = WorkflowSchema.parse(
        z.object({ definition: z.unknown() }).parse(versionResult.data).definition,
      );
      const context = await systemWorkspaceContextForRun(run);
      await executeQueuedCloudRun(context, run, workflow, true);
      continuedCount += 1;
    } catch {
      failedCount += 1;
    }
  }
  return { continuedCount, failedCount, inspectedCount: rows.length };
}

async function sweepProductionRuns(actor: RunActor, runId?: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from('workflow_runs')
    .select('id, status, timeout_at')
    .eq('tenant_id', actor.tenantId)
    .in('status', ['awaiting_approval', 'queued', 'running'])
    .lte('timeout_at', new Date().toISOString());
  if (runId !== undefined) query = query.eq('id', runId);
  const result = await query.limit(100);
  if (result.error !== null) return;
  const rows = z
    .array(
      z.object({
        id: UuidSchema,
        status: z.enum(['awaiting_approval', 'queued', 'running']),
        timeout_at: TimestampSchema,
      }),
    )
    .parse(result.data);
  await Promise.all(
    rows.map(
      async (row) =>
        await transition(undefined, actor.tenantId, row.id, row.status, 'timed_out', {
          errorCode: 'RUN_TIMEOUT',
          errorMessage: 'The workflow exceeded its run timeout.',
        }),
    ),
  );
}
