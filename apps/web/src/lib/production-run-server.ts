import 'server-only';

import {
  RunOrchestrationError,
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
  StepResultSchema,
  WorkflowSchema,
  summarizeWorkflowRisks,
  validateWorkflow,
  type Workflow,
} from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

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
  id: UuidSchema,
  status: z.enum(['offline', 'online', 'pairing', 'revoked']),
});

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
    .select('id, status')
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
  DeviceRowSchema.parse(deviceResult.data);

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
    workflow.executionTarget.type !== 'desktop'
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
    deviceId: workflow.executionTarget.deviceId,
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
    steps: steps.map((step) => ({
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
      processedFileCount: step.processed_file_count,
      processedRowCount: step.processed_row_count,
      ...(step.started_at === null ? {} : { startedAt: step.started_at }),
      status: step.status === 'timed_out' ? 'cancelled' : step.status,
    })),
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
    metadata: { requiresApproval: risk.requiresApproval },
    resource_id: runId,
    resource_type: 'workflow_run',
    tenant_id: actor.tenantId,
  });
  if (stepInsert.error !== null || auditInsert.error !== null) {
    await admin.from('workflow_runs').delete().eq('tenant_id', actor.tenantId).eq('id', runId);
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The workflow run could not be audited.');
  }
  if (risk.requiresApproval) {
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
  actor: RunActor,
  runIdInput: string,
  approvalIdInput: string,
  decision: 'approve' | 'reject',
): Promise<WorkflowRunView> {
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
  actor: RunActor,
  runIdInput: string,
): Promise<WorkflowRunView> {
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
  const queued = await transition(actor, actor.tenantId, view.id, view.status, 'queued');
  const versionResult = await createSupabaseAdminClient()
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
  const target = await requireProductionTarget(actor.tenantId, workflow);
  const stepInsert = await createSupabaseAdminClient()
    .from('workflow_run_steps')
    .insert(
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
  await enqueueProductionJob(actor, queued, workflow, target.deviceId);
  return await runView(actor.tenantId, view.id);
}

export async function syncProductionAgentProgress(input: AgentProgressInput): Promise<void> {
  const parsed = z
    .object({
      deviceId: UuidSchema,
      eventId: UuidSchema,
      jobId: UuidSchema,
      step: StepResultSchema,
      tenantId: UuidSchema,
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
  if (run.status === 'queued') {
    await transition(undefined, parsed.tenantId, run.id, 'queued', 'running', {
      deviceId: parsed.deviceId,
    });
  }
  const safeStep = StepResultSchema.parse(parsed.step);
  const update = await admin
    .from('workflow_run_steps')
    .update({
      completed_at: safeStep.completedAt ?? null,
      error_code: safeStep.error?.code ?? null,
      error_message: safeStep.error?.message ?? null,
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
