import 'server-only';

import { InMemoryAgentStore } from '@ai-workflow-studio/agent-protocol';
import { RunOrchestrator, type WorkflowRunView } from '@ai-workflow-studio/run-orchestrator';
import {
  StepResultSchema,
  WorkflowSchema,
  type AgentJob,
} from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

import { getAgentServerState, getWebActor } from './agent-server';
import { getEnvironment } from './env';
import { MOCK_DEVICE_ID, MOCK_VERSION_ID, MOCK_WORKFLOW, MOCK_WORKFLOW_ID } from './mock-workflows';
import {
  cancelProductionRun,
  getProductionRun,
  listProductionRuns,
  resolveProductionRunApproval,
  retryProductionRun,
  syncProductionAgentCompletion,
  syncProductionAgentFailure,
  syncProductionAgentProgress,
} from './production-run-server';

const StartMockRunSchema = z
  .object({
    deviceId: z.string().uuid(),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/),
    maxAttempts: z.number().int().min(1).max(5).default(3),
    requiresApproval: z.boolean().default(true),
    timeoutSeconds: z.number().int().min(30).max(86_400).default(1_800),
  })
  .strict();
const ProgressSyncSchema = z
  .object({
    eventId: z.string().uuid(),
    step: StepResultSchema,
  })
  .strict();
const CompleteSyncSchema = z.object({ eventId: z.string().uuid() }).passthrough();
const FailSyncSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1).max(120),
        message: z.string().min(1).max(500),
        retryable: z.boolean(),
      })
      .strict(),
    eventId: z.string().uuid(),
  })
  .strict();

const runGlobal = globalThis as typeof globalThis & {
  __aiWorkflowRunOrchestrator?: RunOrchestrator;
};

function mockReadWorkflow(deviceId: string) {
  return WorkflowSchema.parse({
    description: 'Mock Agent validates a bounded metadata payload.',
    edges: [],
    executionTarget: { deviceId, type: 'desktop' },
    name: 'Agent reconnect validation',
    nodes: [
      {
        config: { onInvalid: 'fail', rules: [{ field: 'id', required: true }] },
        id: 'validate_orders',
        type: 'data.validate',
        version: 1,
      },
    ],
    schemaVersion: 1,
    trigger: { config: {}, type: 'manual.trigger' },
  });
}

function mockApprovedWorkflow(deviceId: string) {
  return WorkflowSchema.parse({
    ...MOCK_WORKFLOW,
    executionTarget: { deviceId, type: 'desktop' },
  });
}

export function getRunOrchestrator(): RunOrchestrator {
  if (!getEnvironment().mockMode) {
    throw new Error('Authenticated production run persistence is not configured.');
  }
  runGlobal.__aiWorkflowRunOrchestrator ??= new RunOrchestrator({
    dispatcher: {
      async cancel(tenantId, jobId, now) {
        return await getAgentServerState().store.cancelJob(tenantId, jobId, now);
      },
      async enqueue(job) {
        const store = getAgentServerState().store;
        if (!(store instanceof InMemoryAgentStore)) {
          throw new Error('Mock Run orchestration requires the in-memory Agent store.');
        }
        store.seedJob(job);
      },
    },
  });
  return runGlobal.__aiWorkflowRunOrchestrator;
}

export async function createMockRun(input: unknown) {
  const parsed = StartMockRunSchema.parse(input);
  const actor = await getWebActor();
  return await getRunOrchestrator().start(actor, {
    deviceId: parsed.deviceId,
    idempotencyKey: parsed.idempotencyKey,
    maxAttempts: parsed.maxAttempts,
    timeoutSeconds: parsed.timeoutSeconds,
    workflow: parsed.requiresApproval
      ? mockApprovedWorkflow(parsed.deviceId)
      : mockReadWorkflow(parsed.deviceId),
    workflowId: MOCK_WORKFLOW_ID,
    workflowVersionId: MOCK_VERSION_ID,
  });
}

export async function ensureMockRun(): Promise<void> {
  if (!getEnvironment().mockMode) {
    return;
  }
  const actor = await getWebActor();
  if (getRunOrchestrator().list(actor).length > 0) {
    return;
  }
  await createMockRun({
    deviceId: MOCK_DEVICE_ID,
    idempotencyKey: 'mock-dashboard-approval',
    requiresApproval: true,
  });
}

export async function listRuns(): Promise<readonly WorkflowRunView[]> {
  const actor = await getWebActor();
  if (!getEnvironment().mockMode) {
    return await listProductionRuns(actor);
  }
  await getRunOrchestrator().sweepExpired();
  return getRunOrchestrator().list(actor);
}

export async function getRun(runId: string): Promise<WorkflowRunView> {
  const actor = await getWebActor();
  if (!getEnvironment().mockMode) {
    return await getProductionRun(actor, runId);
  }
  await getRunOrchestrator().sweepExpired();
  return getRunOrchestrator().get(actor, runId);
}

export async function resolveRunApproval(
  runId: string,
  approvalId: string,
  decision: 'approve' | 'reject',
): Promise<WorkflowRunView> {
  const actor = await getWebActor();
  if (!getEnvironment().mockMode) {
    return await resolveProductionRunApproval(actor, runId, approvalId, decision);
  }
  return decision === 'approve'
    ? await getRunOrchestrator().approve(actor, runId, approvalId)
    : await getRunOrchestrator().reject(actor, runId, approvalId);
}

export async function cancelRun(runId: string): Promise<WorkflowRunView> {
  const actor = await getWebActor();
  return getEnvironment().mockMode
    ? await getRunOrchestrator().cancel(actor, runId)
    : await cancelProductionRun(actor, runId);
}

export async function retryRun(runId: string): Promise<WorkflowRunView> {
  const actor = await getWebActor();
  return getEnvironment().mockMode
    ? await getRunOrchestrator().retry(actor, runId)
    : await retryProductionRun(actor, runId);
}

export async function syncAgentProgress(job: AgentJob, input: unknown): Promise<void> {
  const parsed = ProgressSyncSchema.parse(input);
  if (!getEnvironment().mockMode) {
    await syncProductionAgentProgress({
      deviceId: job.deviceId,
      eventId: parsed.eventId,
      jobId: job.id,
      step: parsed.step,
      tenantId: job.tenantId,
    });
    return;
  }
  await getRunOrchestrator().recordAgentProgress({
    deviceId: job.deviceId,
    eventId: parsed.eventId,
    jobId: job.id,
    step: parsed.step,
    tenantId: job.tenantId,
  });
}

export async function syncAgentCompletion(job: AgentJob, input: unknown): Promise<void> {
  const parsed = CompleteSyncSchema.parse(input);
  if (!getEnvironment().mockMode) {
    await syncProductionAgentCompletion({
      deviceId: job.deviceId,
      eventId: parsed.eventId,
      jobId: job.id,
      tenantId: job.tenantId,
    });
    return;
  }
  await getRunOrchestrator().completeAgentJob({
    deviceId: job.deviceId,
    eventId: parsed.eventId,
    jobId: job.id,
    tenantId: job.tenantId,
  });
}

export async function syncAgentFailure(job: AgentJob, input: unknown): Promise<void> {
  const parsed = FailSyncSchema.parse(input);
  if (!getEnvironment().mockMode) {
    await syncProductionAgentFailure({
      deviceId: job.deviceId,
      error: parsed.error,
      eventId: parsed.eventId,
      jobId: job.id,
      tenantId: job.tenantId,
    });
    return;
  }
  await getRunOrchestrator().failAgentJob({
    deviceId: job.deviceId,
    error: parsed.error,
    eventId: parsed.eventId,
    jobId: job.id,
    tenantId: job.tenantId,
  });
}
