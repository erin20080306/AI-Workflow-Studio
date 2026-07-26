import {
  AgentJobSchema,
  StepResultSchema,
  WorkflowSchema,
  summarizeWorkflowRisks,
  validateWorkflow,
  type AgentJob,
  type StepResult,
} from '@ai-workflow-studio/workflow-schema';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { RunOrchestrationError } from './errors';
import { InMemoryRunStore, type RunRecord } from './store';
import type {
  AgentCompletionInput,
  AgentFailureInput,
  AgentProgressInput,
  RunActor,
  RunAuditEntry,
  RunJobDispatcher,
  RunNotification,
  RunStartResult,
  StartRunInput,
  WorkflowRunView,
} from './types';

const UuidSchema = z.string().uuid();
const ActorSchema = z
  .object({
    role: z.enum(['owner', 'admin', 'editor', 'viewer']),
    tenantId: UuidSchema,
    userId: UuidSchema,
  })
  .strict();
const StartRunSchema = z
  .object({
    deviceId: UuidSchema,
    idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/),
    maxAttempts: z.number().int().min(1).max(5).default(3),
    timeoutSeconds: z.number().int().min(30).max(86_400).default(1_800),
    workflow: WorkflowSchema,
    workflowId: UuidSchema,
    workflowVersionId: UuidSchema,
  })
  .strict();
const AgentIdentitySchema = z
  .object({
    deviceId: UuidSchema,
    eventId: UuidSchema,
    jobId: UuidSchema,
    tenantId: UuidSchema,
  })
  .strict();
const AgentProgressSchema = AgentIdentitySchema.extend({
  step: StepResultSchema,
}).strict();
const AgentFailureSchema = AgentIdentitySchema.extend({
  error: z
    .object({
      code: z.string().trim().min(1).max(120),
      message: z.string().trim().min(1).max(500),
      retryable: z.boolean(),
    })
    .strict(),
}).strict();
const ACTIVE_STATUSES = new Set(['awaiting_approval', 'queued', 'running']);

export interface RunOrchestratorOptions {
  readonly dispatcher: RunJobDispatcher;
  readonly idFactory?: () => string;
  readonly now?: () => Date;
  readonly store?: InMemoryRunStore;
}

function definitionHash(input: z.infer<typeof StartRunSchema>): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        deviceId: input.deviceId,
        workflow: input.workflow,
        workflowId: input.workflowId,
        workflowVersionId: input.workflowVersionId,
      }),
    )
    .digest('hex');
}

function withoutOutput(step: StepResult, nodeType: string, attempt: number) {
  const { output: _output, ...safeStep } = StepResultSchema.parse(step);
  void _output;
  return {
    ...safeStep,
    attempt,
    nodeType,
  };
}

function publicView(record: RunRecord): WorkflowRunView {
  return structuredClone(record.view);
}

export class RunOrchestrator {
  private readonly dispatcher: RunJobDispatcher;
  private readonly idFactory: () => string;
  private readonly now: () => Date;
  private readonly store: InMemoryRunStore;

  constructor(options: RunOrchestratorOptions) {
    this.dispatcher = options.dispatcher;
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.store = options.store ?? new InMemoryRunStore();
  }

  async start(actorInput: RunActor, inputValue: StartRunInput): Promise<RunStartResult> {
    const actor = ActorSchema.parse(actorInput);
    this.assertCanMutate(actor);
    const input = StartRunSchema.parse(inputValue);
    const validation = validateWorkflow(input.workflow);
    if (!validation.success) {
      throw new RunOrchestrationError('RUN_INVALID', 'The workflow version is invalid.');
    }
    if (
      input.workflow.executionTarget.type !== 'desktop' ||
      input.workflow.executionTarget.deviceId !== input.deviceId
    ) {
      throw new RunOrchestrationError(
        'RUN_INVALID',
        'The workflow target must match the selected Desktop Agent.',
      );
    }

    const hash = definitionHash(input);
    const existing = this.store.findByIdempotency(actor.tenantId, input.idempotencyKey);
    if (existing !== undefined) {
      if (existing.definitionHash !== hash) {
        throw new RunOrchestrationError(
          'RUN_CONFLICT',
          'The run idempotency key is already bound to different input.',
        );
      }
      return { duplicate: true, run: publicView(existing) };
    }

    const now = this.now();
    const createdAt = now.toISOString();
    const riskSummary = summarizeWorkflowRisks(input.workflow);
    const runId = this.uuid();
    const approval = riskSummary.requiresApproval
      ? {
          expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
          id: this.uuid(),
          requestedAt: createdAt,
          requestedBy: actor.userId,
          riskSummary,
          status: 'pending' as const,
        }
      : undefined;
    let record: RunRecord = {
      definitionHash: hash,
      eventIds: new Set(),
      view: {
        ...(approval === undefined ? {} : { approval }),
        attempts: 0,
        audit: [],
        createdAt,
        deviceId: input.deviceId,
        id: runId,
        idempotencyKey: input.idempotencyKey,
        maxAttempts: input.maxAttempts,
        notifications: [],
        status: approval === undefined ? 'queued' : 'awaiting_approval',
        steps: input.workflow.nodes.map((node) => ({
          attempt: 1,
          nodeId: node.id,
          nodeType: node.type,
          processedFileCount: 0,
          processedRowCount: 0,
          status: 'pending',
        })),
        tenantId: actor.tenantId,
        timeoutAt: new Date(now.getTime() + input.timeoutSeconds * 1_000).toISOString(),
        workflowId: input.workflowId,
        workflowName: input.workflow.name,
        workflowVersionId: input.workflowVersionId,
      },
      workflow: input.workflow,
    };
    record = this.withAudit(record, 'run.created', 'user', actor.userId, {
      requiresApproval: riskSummary.requiresApproval,
    });
    if (approval !== undefined) {
      record = this.withNotification(
        record,
        'approval',
        '需要執行核准',
        '工作流已建立，核准前不會派送至 Desktop Agent。',
      );
      record = this.withAudit(record, 'approval.requested', 'system', undefined, {
        approvalId: approval.id,
      });
    }
    this.store.create(record);
    if (approval === undefined) {
      record = await this.dispatch(record, actor.userId);
    }
    return { duplicate: false, run: publicView(record) };
  }

  list(actorInput: RunActor): readonly WorkflowRunView[] {
    const actor = ActorSchema.parse(actorInput);
    return this.store.list(actor.tenantId).map(publicView);
  }

  get(actorInput: RunActor, runIdInput: string): WorkflowRunView {
    const actor = ActorSchema.parse(actorInput);
    return publicView(this.require(actor.tenantId, runIdInput));
  }

  async approve(
    actorInput: RunActor,
    runIdInput: string,
    approvalIdInput: string,
  ): Promise<WorkflowRunView> {
    const actor = ActorSchema.parse(actorInput);
    this.assertCanApprove(actor);
    let record = this.require(actor.tenantId, runIdInput);
    const approvalId = UuidSchema.parse(approvalIdInput);
    const approval = record.view.approval;
    if (
      record.view.status !== 'awaiting_approval' ||
      approval === undefined ||
      approval.id !== approvalId ||
      approval.status !== 'pending'
    ) {
      throw new RunOrchestrationError(
        'RUN_STATE_CONFLICT',
        'The run does not have this pending approval.',
      );
    }
    const now = this.now();
    if (new Date(approval.expiresAt).getTime() <= now.getTime()) {
      record = this.expireApproval(record, now);
      this.store.save(record);
      throw new RunOrchestrationError('RUN_APPROVAL_EXPIRED', 'The run approval has expired.');
    }
    record = {
      ...record,
      view: {
        ...record.view,
        approval: {
          ...approval,
          resolvedAt: now.toISOString(),
          resolvedBy: actor.userId,
          status: 'approved',
        },
        status: 'queued',
      },
    };
    record = this.withAudit(record, 'approval.approved', 'user', actor.userId, {
      approvalId,
    });
    this.store.save(record);
    record = await this.dispatch(record, actor.userId);
    return publicView(record);
  }

  async reject(
    actorInput: RunActor,
    runIdInput: string,
    approvalIdInput: string,
  ): Promise<WorkflowRunView> {
    const actor = ActorSchema.parse(actorInput);
    this.assertCanApprove(actor);
    let record = this.require(actor.tenantId, runIdInput);
    const approvalId = UuidSchema.parse(approvalIdInput);
    const approval = record.view.approval;
    if (
      record.view.status !== 'awaiting_approval' ||
      approval === undefined ||
      approval.id !== approvalId ||
      approval.status !== 'pending'
    ) {
      throw new RunOrchestrationError(
        'RUN_STATE_CONFLICT',
        'The run does not have this pending approval.',
      );
    }
    const now = this.now().toISOString();
    record = {
      ...record,
      view: {
        ...record.view,
        approval: {
          ...approval,
          resolvedAt: now,
          resolvedBy: actor.userId,
          status: 'rejected',
        },
        completedAt: now,
        status: 'cancelled',
      },
    };
    record = this.withAudit(record, 'approval.rejected', 'user', actor.userId, {
      approvalId,
    });
    record = this.withNotification(
      record,
      'info',
      '執行已取消',
      '核准要求已拒絕，未派送任何 Desktop Job。',
    );
    this.store.save(record);
    return publicView(record);
  }

  async cancel(actorInput: RunActor, runIdInput: string): Promise<WorkflowRunView> {
    const actor = ActorSchema.parse(actorInput);
    this.assertCanMutate(actor);
    let record = this.require(actor.tenantId, runIdInput);
    if (!ACTIVE_STATUSES.has(record.view.status)) {
      throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'Only an active run can be cancelled.');
    }
    if (record.view.jobId !== undefined) {
      await this.dispatcher.cancel(actor.tenantId, record.view.jobId, this.now());
    }
    const completedAt = this.now().toISOString();
    record = {
      ...record,
      view: {
        ...record.view,
        completedAt,
        status: 'cancelled',
        steps: record.view.steps.map((step) =>
          step.status === 'pending' || step.status === 'running'
            ? { ...step, completedAt, status: 'cancelled' as const }
            : step,
        ),
      },
    };
    record = this.withAudit(record, 'run.cancelled', 'user', actor.userId, {});
    record = this.withNotification(record, 'info', '執行已取消', 'Desktop Job 已停止派送。');
    this.store.save(record);
    return publicView(record);
  }

  async retry(actorInput: RunActor, runIdInput: string): Promise<WorkflowRunView> {
    const actor = ActorSchema.parse(actorInput);
    this.assertCanMutate(actor);
    let record = this.require(actor.tenantId, runIdInput);
    if (
      (record.view.status !== 'failed' && record.view.status !== 'timed_out') ||
      record.view.attempts >= record.view.maxAttempts
    ) {
      throw new RunOrchestrationError(
        'RUN_STATE_CONFLICT',
        'The run cannot be retried in its current state.',
      );
    }
    record = this.prepareRetry(record);
    record = this.withAudit(record, 'run.retry_requested', 'user', actor.userId, {
      nextAttempt: record.view.attempts + 1,
    });
    this.store.save(record);
    record = await this.dispatch(record, actor.userId);
    return publicView(record);
  }

  async recordAgentProgress(inputValue: AgentProgressInput): Promise<{
    readonly duplicate: boolean;
    readonly run: WorkflowRunView;
  }> {
    const input = AgentProgressSchema.parse(inputValue);
    let record = this.requireForJob(input.tenantId, input.deviceId, input.jobId);
    if (record.eventIds.has(input.eventId)) {
      return { duplicate: true, run: publicView(record) };
    }
    if (record.view.status !== 'queued' && record.view.status !== 'running') {
      throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The run is not accepting progress.');
    }
    const current = record.view.steps.find((step) => step.nodeId === input.step.nodeId);
    if (current === undefined) {
      throw new RunOrchestrationError('RUN_INVALID', 'The progress node is not in this run.');
    }
    const startedAt = record.view.startedAt ?? input.step.startedAt ?? this.now().toISOString();
    const safeStep = withoutOutput(input.step, current.nodeType, record.view.attempts);
    record.eventIds.add(input.eventId);
    record = {
      ...record,
      view: {
        ...record.view,
        startedAt,
        status: 'running',
        steps: record.view.steps.map((step) => (step.nodeId === safeStep.nodeId ? safeStep : step)),
      },
    };
    record = this.withAudit(record, 'run.step_progress', 'device', input.deviceId, {
      eventId: input.eventId,
      nodeId: safeStep.nodeId,
      processedFileCount: safeStep.processedFileCount,
      processedRowCount: safeStep.processedRowCount,
      status: safeStep.status,
    });
    this.store.save(record);
    return { duplicate: false, run: publicView(record) };
  }

  async completeAgentJob(inputValue: AgentCompletionInput): Promise<{
    readonly duplicate: boolean;
    readonly run: WorkflowRunView;
  }> {
    const input = AgentIdentitySchema.parse(inputValue);
    let record = this.requireForJob(input.tenantId, input.deviceId, input.jobId);
    if (record.eventIds.has(input.eventId)) {
      return { duplicate: true, run: publicView(record) };
    }
    if (record.view.status !== 'queued' && record.view.status !== 'running') {
      throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The run cannot be completed.');
    }
    const unfinishedSteps = record.view.steps.filter(
      (step) => step.status !== 'succeeded' && step.status !== 'skipped',
    );
    if (unfinishedSteps.length > 0) {
      throw new RunOrchestrationError(
        'RUN_STATE_CONFLICT',
        `Run still has unfinished steps: ${unfinishedSteps.map((step) => step.nodeId).join(', ')}`,
      );
    }
    record.eventIds.add(input.eventId);
    const completedAt = this.now().toISOString();
    record = {
      ...record,
      view: {
        ...record.view,
        completedAt,
        startedAt: record.view.startedAt ?? completedAt,
        status: 'succeeded',
      },
    };
    record = this.withAudit(record, 'run.succeeded', 'device', input.deviceId, {
      attempt: record.view.attempts,
      eventId: input.eventId,
    });
    record = this.withNotification(
      record,
      'success',
      '工作流執行完成',
      `${record.view.workflowName} 已成功完成。`,
    );
    this.store.save(record);
    return { duplicate: false, run: publicView(record) };
  }

  async failAgentJob(inputValue: AgentFailureInput): Promise<{
    readonly duplicate: boolean;
    readonly retried: boolean;
    readonly run: WorkflowRunView;
  }> {
    const input = AgentFailureSchema.parse(inputValue);
    let record = this.requireForJob(input.tenantId, input.deviceId, input.jobId);
    if (record.eventIds.has(input.eventId)) {
      return { duplicate: true, retried: false, run: publicView(record) };
    }
    if (record.view.status !== 'queued' && record.view.status !== 'running') {
      throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The run cannot be failed.');
    }
    record.eventIds.add(input.eventId);
    const completedAt = this.now().toISOString();
    record = {
      ...record,
      view: {
        ...record.view,
        completedAt,
        error: input.error,
        startedAt: record.view.startedAt ?? completedAt,
        status: 'failed',
      },
    };
    record = this.withAudit(record, 'run.failed', 'device', input.deviceId, {
      attempt: record.view.attempts,
      errorCode: input.error.code,
      eventId: input.eventId,
      retryable: input.error.retryable,
    });
    this.store.save(record);
    if (input.error.retryable && record.view.attempts < record.view.maxAttempts) {
      record = this.prepareRetry(record);
      record = this.withAudit(record, 'run.retry_scheduled', 'system', undefined, {
        nextAttempt: record.view.attempts + 1,
      });
      this.store.save(record);
      record = await this.dispatch(record);
      return { duplicate: false, retried: true, run: publicView(record) };
    }
    record = this.withNotification(
      record,
      'error',
      '工作流執行失敗',
      '執行已停止；詳細錯誤代碼可在 Run details 檢視。',
    );
    this.store.save(record);
    return { duplicate: false, retried: false, run: publicView(record) };
  }

  async sweepExpired(atInput = this.now()): Promise<readonly WorkflowRunView[]> {
    const at = new Date(atInput);
    const changed: WorkflowRunView[] = [];
    for (const snapshot of this.store.snapshot()) {
      if (!ACTIVE_STATUSES.has(snapshot.view.status)) {
        continue;
      }
      if (
        snapshot.view.status === 'awaiting_approval' &&
        snapshot.view.approval !== undefined &&
        new Date(snapshot.view.approval.expiresAt).getTime() <= at.getTime()
      ) {
        const expired = this.expireApproval(snapshot, at);
        this.store.save(expired);
        changed.push(publicView(expired));
        continue;
      }
      if (new Date(snapshot.view.timeoutAt).getTime() > at.getTime()) {
        continue;
      }
      if (snapshot.view.jobId !== undefined) {
        await this.dispatcher.cancel(snapshot.view.tenantId, snapshot.view.jobId, at);
      }
      let timedOut: RunRecord = {
        ...snapshot,
        view: {
          ...snapshot.view,
          completedAt: at.toISOString(),
          error: {
            code: 'RUN_TIMEOUT',
            message: 'The workflow exceeded its run timeout.',
            retryable: true,
          },
          status: 'timed_out',
          steps: snapshot.view.steps.map((step) =>
            step.status === 'pending' || step.status === 'running'
              ? { ...step, completedAt: at.toISOString(), status: 'cancelled' as const }
              : step,
          ),
        },
      };
      timedOut = this.withAudit(timedOut, 'run.timed_out', 'system', undefined, {});
      timedOut = this.withNotification(
        timedOut,
        'error',
        '工作流執行逾時',
        'Run 已停止，可在確認原因後手動重試。',
      );
      this.store.save(timedOut);
      changed.push(publicView(timedOut));
    }
    return changed;
  }

  private async dispatch(recordInput: RunRecord, actorId?: string): Promise<RunRecord> {
    const now = this.now();
    const jobId = this.uuid();
    const attempt = recordInput.view.attempts + 1;
    const job: AgentJob = AgentJobSchema.parse({
      attempt: 0,
      availableAt: now.toISOString(),
      deviceId: recordInput.view.deviceId,
      id: jobId,
      idempotencyKey: `${recordInput.view.id}:desktop:${attempt}`,
      maxAttempts: 3,
      status: 'pending',
      tenantId: recordInput.view.tenantId,
      workflow: recordInput.workflow,
      workflowRunId: recordInput.view.id,
    });
    const {
      completedAt: _completedAt,
      error: _error,
      jobId: _jobId,
      startedAt: _startedAt,
      ...baseView
    } = recordInput.view;
    void _completedAt;
    void _error;
    void _jobId;
    void _startedAt;
    let record: RunRecord = {
      ...recordInput,
      view: {
        ...baseView,
        attempts: attempt,
        jobId,
        status: 'queued',
        steps: recordInput.view.steps.map((step) => ({
          ...step,
          attempt,
        })),
      },
    };
    record = this.withAudit(
      record,
      'agent_job.queued',
      actorId === undefined ? 'system' : 'user',
      actorId,
      { attempt, jobId },
    );
    this.store.save(record);
    try {
      await this.dispatcher.enqueue(job);
      return record;
    } catch (error) {
      const failedAt = this.now().toISOString();
      record = {
        ...record,
        view: {
          ...record.view,
          completedAt: failedAt,
          error: {
            code: 'RUN_DISPATCH_FAILED',
            message: 'The Desktop Job could not be queued.',
            retryable: true,
          },
          status: 'failed',
        },
      };
      record = this.withAudit(record, 'agent_job.dispatch_failed', 'system', undefined, {
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
      record = this.withNotification(
        record,
        'error',
        'Desktop Job 派送失敗',
        'Run 尚未執行，可在連線恢復後重試。',
      );
      this.store.save(record);
      return record;
    }
  }

  private prepareRetry(record: RunRecord): RunRecord {
    const {
      completedAt: _completedAt,
      error: _error,
      jobId: _jobId,
      startedAt: _startedAt,
      ...view
    } = record.view;
    void _completedAt;
    void _error;
    void _jobId;
    void _startedAt;
    return {
      ...record,
      view: {
        ...view,
        status: 'queued',
        steps: record.view.steps.map((step) => ({
          attempt: record.view.attempts + 1,
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          processedFileCount: 0,
          processedRowCount: 0,
          status: 'pending',
        })),
      },
    };
  }

  private expireApproval(record: RunRecord, at: Date): RunRecord {
    const approval = record.view.approval;
    if (approval === undefined) {
      return record;
    }
    let expired: RunRecord = {
      ...record,
      view: {
        ...record.view,
        approval: {
          ...approval,
          resolvedAt: at.toISOString(),
          status: 'expired',
        },
        completedAt: at.toISOString(),
        error: {
          code: 'RUN_APPROVAL_EXPIRED',
          message: 'The workflow approval expired before execution.',
          retryable: false,
        },
        status: 'cancelled',
      },
    };
    expired = this.withAudit(expired, 'approval.expired', 'system', undefined, {
      approvalId: approval.id,
    });
    return this.withNotification(expired, 'info', '核准要求已過期', '未派送任何 Desktop Job。');
  }

  private require(tenantId: string, runIdInput: string): RunRecord {
    const runId = UuidSchema.parse(runIdInput);
    const record = this.store.get(tenantId, runId);
    if (record === undefined) {
      throw new RunOrchestrationError('RUN_NOT_FOUND', 'The workflow run was not found.');
    }
    return record;
  }

  private requireForJob(tenantId: string, deviceId: string, jobId: string): RunRecord {
    const parsedTenantId = UuidSchema.parse(tenantId);
    const parsedDeviceId = UuidSchema.parse(deviceId);
    const parsedJobId = UuidSchema.parse(jobId);
    const record = this.store
      .list(parsedTenantId)
      .find(
        (candidate) =>
          candidate.view.jobId === parsedJobId && candidate.view.deviceId === parsedDeviceId,
      );
    if (record === undefined) {
      throw new RunOrchestrationError('RUN_NOT_FOUND', 'The workflow run was not found.');
    }
    return record;
  }

  private assertCanMutate(actor: RunActor): void {
    if (actor.role === 'viewer') {
      throw new RunOrchestrationError('RUN_FORBIDDEN', 'The tenant role cannot change runs.');
    }
  }

  private assertCanApprove(actor: RunActor): void {
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      throw new RunOrchestrationError(
        'RUN_FORBIDDEN',
        'Only a tenant owner or administrator can resolve approvals.',
      );
    }
  }

  private uuid(): string {
    return UuidSchema.parse(this.idFactory());
  }

  private withAudit(
    record: RunRecord,
    action: string,
    actorType: RunAuditEntry['actorType'],
    actorId: string | undefined,
    metadata: RunAuditEntry['metadata'],
  ): RunRecord {
    const entry: RunAuditEntry = {
      action,
      ...(actorId === undefined ? {} : { actorId }),
      actorType,
      createdAt: this.now().toISOString(),
      id: this.uuid(),
      metadata,
    };
    return {
      ...record,
      view: {
        ...record.view,
        audit: [...record.view.audit, entry],
      },
    };
  }

  private withNotification(
    record: RunRecord,
    kind: RunNotification['kind'],
    title: string,
    message: string,
  ): RunRecord {
    const notification: RunNotification = {
      createdAt: this.now().toISOString(),
      id: this.uuid(),
      kind,
      message,
      read: false,
      title,
    };
    return {
      ...record,
      view: {
        ...record.view,
        notifications: [...record.view.notifications, notification],
      },
    };
  }
}
