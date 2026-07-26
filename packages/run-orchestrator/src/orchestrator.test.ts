import { WorkflowSchema, type AgentJob, type Workflow } from '@ai-workflow-studio/workflow-schema';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { RunOrchestrationError } from './errors';
import { RunOrchestrator } from './orchestrator';
import type { RunActor, RunJobDispatcher } from './types';

const TENANT_ID = '10000000-0000-4000-8000-000000001101';
const OTHER_TENANT_ID = '10000000-0000-4000-8000-000000001102';
const USER_ID = '10000000-0000-4000-8000-000000001103';
const DEVICE_ID = '10000000-0000-4000-8000-000000001104';
const WORKFLOW_ID = '10000000-0000-4000-8000-000000001105';
const VERSION_ID = '10000000-0000-4000-8000-000000001106';
const PROGRESS_EVENT_ID = '10000000-0000-4000-8000-000000001107';
const COMPLETE_EVENT_ID = '10000000-0000-4000-8000-000000001108';
const FAIL_EVENT_ID = '10000000-0000-4000-8000-000000001109';

const owner: RunActor = {
  role: 'owner',
  tenantId: TENANT_ID,
  userId: USER_ID,
};

function workflow(requiresApproval: boolean): Workflow {
  return WorkflowSchema.parse(
    requiresApproval
      ? {
          description: 'Create an approved report.',
          edges: [],
          executionTarget: { deviceId: DEVICE_ID, type: 'desktop' as const },
          name: 'Approved report',
          nodes: [
            {
              config: {
                folderAliasId: '10000000-0000-4000-8000-000000001110',
                outputName: 'report.xlsx',
                overwrite: false as const,
                reportTitle: 'Report',
              },
              id: 'create_report',
              type: 'excel.create_report' as const,
              version: 1 as const,
            },
          ],
          schemaVersion: 1 as const,
          trigger: { config: {}, type: 'manual.trigger' as const },
        }
      : {
          description: 'Validate data.',
          edges: [],
          executionTarget: { deviceId: DEVICE_ID, type: 'desktop' as const },
          name: 'Validate',
          nodes: [
            {
              config: {
                onInvalid: 'fail' as const,
                rules: [{ field: 'id', required: true }],
              },
              id: 'validate',
              type: 'data.validate' as const,
              version: 1 as const,
            },
          ],
          schemaVersion: 1 as const,
          trigger: { config: {}, type: 'manual.trigger' as const },
        },
  );
}

function harness() {
  let now = new Date('2026-07-26T08:00:00.000Z');
  const jobs: AgentJob[] = [];
  const cancelled: string[] = [];
  const dispatcher: RunJobDispatcher = {
    async cancel(_tenantId, jobId) {
      cancelled.push(jobId);
      return true;
    },
    async enqueue(job) {
      jobs.push(structuredClone(job));
    },
  };
  const orchestrator = new RunOrchestrator({
    dispatcher,
    idFactory: randomUUID,
    now: () => new Date(now),
  });
  return {
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
    cancelled,
    jobs,
    orchestrator,
  };
}

function startInput(requiresApproval: boolean, idempotencyKey: string) {
  return {
    deviceId: DEVICE_ID,
    idempotencyKey,
    maxAttempts: 3,
    timeoutSeconds: 60,
    workflow: workflow(requiresApproval),
    workflowId: WORKFLOW_ID,
    workflowVersionId: VERSION_ID,
  };
}

describe('RunOrchestrator', () => {
  it('holds a write run for approval, dispatches once, redacts progress, and completes', async () => {
    const { jobs, orchestrator } = harness();
    const started = await orchestrator.start(owner, startInput(true, 'run:approval:1'));
    expect(started.run).toMatchObject({
      attempts: 0,
      status: 'awaiting_approval',
    });
    expect(jobs).toHaveLength(0);

    const duplicate = await orchestrator.start(owner, startInput(true, 'run:approval:1'));
    expect(duplicate).toMatchObject({
      duplicate: true,
      run: { id: started.run.id },
    });

    const approved = await orchestrator.approve(
      owner,
      started.run.id,
      started.run.approval?.id ?? '',
    );
    expect(approved).toMatchObject({ attempts: 1, status: 'queued' });
    expect(jobs).toHaveLength(1);
    const jobId = approved.jobId ?? '';

    const progress = await orchestrator.recordAgentProgress({
      deviceId: DEVICE_ID,
      eventId: PROGRESS_EVENT_ID,
      jobId,
      step: {
        nodeId: 'create_report',
        output: { privateRows: [['must-not-persist']] },
        processedFileCount: 1,
        processedRowCount: 25,
        status: 'succeeded',
      },
      tenantId: TENANT_ID,
    });
    expect(JSON.stringify(progress.run)).not.toContain('must-not-persist');
    expect(progress.run).toMatchObject({
      status: 'running',
      steps: [{ processedRowCount: 25, status: 'succeeded' }],
    });
    await expect(
      orchestrator.recordAgentProgress({
        deviceId: DEVICE_ID,
        eventId: PROGRESS_EVENT_ID,
        jobId,
        step: {
          nodeId: 'create_report',
          processedFileCount: 0,
          processedRowCount: 25,
          status: 'succeeded',
        },
        tenantId: TENANT_ID,
      }),
    ).resolves.toMatchObject({ duplicate: true });

    const completed = await orchestrator.completeAgentJob({
      deviceId: DEVICE_ID,
      eventId: COMPLETE_EVENT_ID,
      jobId,
      tenantId: TENANT_ID,
    });
    expect(completed.run).toMatchObject({
      status: 'succeeded',
      notifications: expect.arrayContaining([expect.objectContaining({ kind: 'success' })]),
    });
    expect(completed.run.audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'run.created',
        'approval.requested',
        'approval.approved',
        'agent_job.queued',
        'run.step_progress',
        'run.succeeded',
      ]),
    );
  });

  it('keeps an offline job pending and prevents duplicate active execution', async () => {
    const { jobs, orchestrator } = harness();
    const started = await orchestrator.start(owner, startInput(false, 'run:offline:1'));
    expect(started.run.status).toBe('queued');
    expect(jobs).toHaveLength(1);
    await expect(
      orchestrator.completeAgentJob({
        deviceId: DEVICE_ID,
        eventId: COMPLETE_EVENT_ID,
        jobId: started.run.jobId ?? '',
        tenantId: TENANT_ID,
      }),
    ).rejects.toMatchObject({ code: 'RUN_STATE_CONFLICT' });

    const replay = await orchestrator.start(owner, startInput(false, 'run:offline:1'));
    expect(replay.duplicate).toBe(true);
    expect(jobs).toHaveLength(1);
  });

  it('automatically retries retryable failures and supports cancel and timeout', async () => {
    const retryHarness = harness();
    const started = await retryHarness.orchestrator.start(owner, startInput(false, 'run:retry:1'));
    const failed = await retryHarness.orchestrator.failAgentJob({
      deviceId: DEVICE_ID,
      error: {
        code: 'TEMPORARY_IO',
        message: 'Temporary I/O failure.',
        retryable: true,
      },
      eventId: FAIL_EVENT_ID,
      jobId: started.run.jobId ?? '',
      tenantId: TENANT_ID,
    });
    expect(failed).toMatchObject({
      retried: true,
      run: { attempts: 2, status: 'queued' },
    });
    expect(retryHarness.jobs).toHaveLength(2);
    expect(retryHarness.jobs[0]?.id).not.toBe(retryHarness.jobs[1]?.id);

    const cancelHarness = harness();
    const cancellable = await cancelHarness.orchestrator.start(
      owner,
      startInput(false, 'run:cancel:1'),
    );
    const cancelled = await cancelHarness.orchestrator.cancel(owner, cancellable.run.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelHarness.cancelled).toEqual([cancellable.run.jobId]);

    const timeoutHarness = harness();
    const expiring = await timeoutHarness.orchestrator.start(
      owner,
      startInput(false, 'run:timeout:1'),
    );
    timeoutHarness.advance(61_000);
    await expect(timeoutHarness.orchestrator.sweepExpired()).resolves.toEqual([
      expect.objectContaining({ id: expiring.run.id, status: 'timed_out' }),
    ]);
  });

  it('enforces role, tenant, idempotency, and approval expiry boundaries', async () => {
    const { advance, orchestrator } = harness();
    await expect(
      orchestrator.start({ ...owner, role: 'viewer' }, startInput(false, 'run:viewer:1')),
    ).rejects.toBeInstanceOf(RunOrchestrationError);

    const started = await orchestrator.start(owner, startInput(true, 'run:boundary:1'));
    expect(() =>
      orchestrator.get({ ...owner, tenantId: OTHER_TENANT_ID }, started.run.id),
    ).toThrowError(expect.objectContaining({ code: 'RUN_NOT_FOUND' }));
    await expect(
      orchestrator.start(owner, {
        ...startInput(false, 'run:boundary:1'),
        workflowId: '10000000-0000-4000-8000-000000001199',
      }),
    ).rejects.toMatchObject({ code: 'RUN_CONFLICT' });

    advance(16 * 60_000);
    await expect(
      orchestrator.approve(owner, started.run.id, started.run.approval?.id ?? ''),
    ).rejects.toMatchObject({ code: 'RUN_APPROVAL_EXPIRED' });
    expect(orchestrator.get(owner, started.run.id)).toMatchObject({
      approval: { status: 'expired' },
      status: 'cancelled',
    });
  });
});
