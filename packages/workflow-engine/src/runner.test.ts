import {
  JsonValueSchema,
  WorkflowSchema,
  type JsonValue,
  type Workflow,
} from '@ai-workflow-studio/workflow-schema';
import { describe, expect, it } from 'vitest';

import type {
  NodeExecutionResult,
  RegisteredWorkflowNodeExecutor,
  WorkflowExecutionContext,
} from './contracts';
import { WorkflowEngineError } from './errors';
import { NodeRegistry, createMockNodeRegistry } from './registry';
import { WorkflowEngine } from './runner';

const DEVICE_ID = '00000000-0000-4000-8000-000000000101';
const FOLDER_ID = '00000000-0000-4000-8000-000000000102';

function desktopWorkflow(): Workflow {
  return WorkflowSchema.parse({
    description: 'Deterministic mock workflow',
    edges: [
      { from: 'list_files', to: 'read_excel' },
      { from: 'read_excel', to: 'deduplicate' },
      { from: 'deduplicate', to: 'create_report' },
    ],
    executionTarget: {
      deviceId: DEVICE_ID,
      type: 'desktop',
    },
    name: 'Deterministic workflow',
    nodes: [
      {
        config: { folderAliasId: FOLDER_ID, pattern: '*.xlsx' },
        id: 'list_files',
        type: 'folder.list_files',
        version: 1,
      },
      {
        config: { sheetMode: 'all' },
        id: 'read_excel',
        type: 'excel.read',
        version: 1,
      },
      {
        config: { keys: ['Order ID'] },
        id: 'deduplicate',
        type: 'data.deduplicate',
        version: 1,
      },
      {
        config: {
          folderAliasId: FOLDER_ID,
          outputName: 'report.xlsx',
          overwrite: false,
        },
        id: 'create_report',
        type: 'excel.create_report',
        version: 1,
      },
    ],
    schemaVersion: 1,
    trigger: {
      config: {},
      type: 'manual.trigger',
    },
  });
}

function singleDataNodeWorkflow(): Workflow {
  return WorkflowSchema.parse({
    description: 'Single data node',
    edges: [],
    executionTarget: { type: 'cloud' },
    name: 'Single data node',
    nodes: [
      {
        config: {
          conditions: [
            {
              field: 'status',
              operator: 'equals',
              value: 'open',
            },
          ],
        },
        id: 'filter_rows',
        type: 'data.filter',
        version: 1,
      },
    ],
    schemaVersion: 1,
    trigger: {
      config: {},
      type: 'manual.trigger',
    },
  });
}

const baseOptions = {
  idempotencyKey: 'workflow-run-0001',
  mode: 'dry-run' as const,
  runId: '00000000-0000-4000-8000-000000000103',
};

describe('NodeRegistry', () => {
  it('registers all allowlisted node executors and rejects duplicate registration', () => {
    const registry = createMockNodeRegistry();
    expect(registry.list()).toHaveLength(36);

    const existing = registry.get('data.filter', 1);
    expect(() => registry.register(existing)).toThrowError(
      expect.objectContaining({ code: 'NODE_REGISTRATION_DUPLICATE' }),
    );
  });

  it('rejects access to an executor that is not registered', () => {
    const registry = new NodeRegistry();
    expect(() => registry.get('data.filter', 1)).toThrowError(
      expect.objectContaining({ code: 'WORKFLOW_NODE_UNKNOWN' }),
    );
  });
});

describe('WorkflowEngine', () => {
  it('plans a dry run in stable topological order without requiring write approval', async () => {
    const engine = new WorkflowEngine(createMockNodeRegistry());
    const result = await engine.execute(desktopWorkflow(), baseOptions);

    expect(result.status).toBe('succeeded');
    expect(result.steps.map((step) => step.nodeId)).toEqual([
      'list_files',
      'read_excel',
      'deduplicate',
      'create_report',
    ]);
    expect(result.steps.every((step) => step.status === 'planned')).toBe(true);
    expect(result.riskSummary.requiresApproval).toBe(true);
  });

  it('blocks a live write node until its node id is approved', async () => {
    const engine = new WorkflowEngine(createMockNodeRegistry());

    await expect(
      engine.execute(desktopWorkflow(), {
        ...baseOptions,
        idempotencyKey: 'workflow-run-0002',
        mode: 'live',
      }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_APPROVAL_REQUIRED',
      details: {
        nodeIds: ['create_report'],
      },
    });
  });

  it('executes approved mock nodes and returns a cached result for a duplicate key', async () => {
    const engine = new WorkflowEngine(createMockNodeRegistry());
    const options = {
      ...baseOptions,
      approvedNodeIds: ['create_report'],
      idempotencyKey: 'workflow-run-0003',
      mode: 'live' as const,
    };

    const first = await engine.execute(desktopWorkflow(), options);
    const duplicate = await engine.execute(desktopWorkflow(), options);

    expect(first.status).toBe('succeeded');
    expect(first.duplicate).toBe(false);
    expect(first.steps.every((step) => step.status === 'succeeded')).toBe(true);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.steps).toEqual(first.steps);
  });

  it('rejects a valid workflow if the executor registry is incomplete', async () => {
    const engine = new WorkflowEngine(new NodeRegistry());

    await expect(engine.execute(singleDataNodeWorkflow(), baseOptions)).rejects.toMatchObject({
      code: 'WORKFLOW_NODE_UNKNOWN',
    });
  });

  it('returns a cancelled result before executing when the run signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort('user_cancelled');
    const engine = new WorkflowEngine(createMockNodeRegistry());
    const result = await engine.execute(singleDataNodeWorkflow(), {
      ...baseOptions,
      idempotencyKey: 'workflow-run-0004',
      signal: controller.signal,
    });

    expect(result.status).toBe('cancelled');
    expect(result.steps).toMatchObject([
      {
        attempts: 0,
        nodeId: 'filter_rows',
        status: 'cancelled',
      },
    ]);
  });

  it('retries a retryable node failure and records the successful attempt count', async () => {
    let calls = 0;
    const retryExecutor: RegisteredWorkflowNodeExecutor = {
      async execute(
        _context: WorkflowExecutionContext,
        input: JsonValue,
        _config: JsonValue,
      ): Promise<NodeExecutionResult<JsonValue>> {
        calls += 1;
        if (calls === 1) {
          throw new WorkflowEngineError('NODE_EXECUTION_FAILED', 'Temporary mock failure.', {
            retryable: true,
          });
        }
        return { output: { calls, input } };
      },
      riskLevel: 'read',
      type: 'data.filter',
      validateConfig: (config: unknown) => JsonValueSchema.parse(config),
      version: 1,
    };
    const registry = new NodeRegistry();
    registry.register(retryExecutor);
    const engine = new WorkflowEngine(registry);

    const result = await engine.execute(singleDataNodeWorkflow(), {
      ...baseOptions,
      idempotencyKey: 'workflow-run-0005',
      maxAttempts: 2,
      mode: 'live',
    });

    expect(calls).toBe(2);
    expect(result.steps[0]).toMatchObject({
      attempts: 2,
      status: 'succeeded',
    });
  });

  it('classifies a bounded step timeout as retryable and terminates the run', async () => {
    const timeoutExecutor: RegisteredWorkflowNodeExecutor = {
      execute: async () => new Promise<NodeExecutionResult<JsonValue>>(() => undefined),
      riskLevel: 'read',
      type: 'data.filter',
      validateConfig: (config: unknown) => JsonValueSchema.parse(config),
      version: 1,
    };
    const registry = new NodeRegistry();
    registry.register(timeoutExecutor);
    const engine = new WorkflowEngine(registry);

    const result = await engine.execute(singleDataNodeWorkflow(), {
      ...baseOptions,
      idempotencyKey: 'workflow-run-0006',
      maxAttempts: 1,
      mode: 'live',
      stepTimeoutMs: 5,
    });

    expect(result.status).toBe('failed');
    expect(result.steps[0]).toMatchObject({
      error: {
        code: 'NODE_EXECUTION_TIMEOUT',
        retryable: true,
      },
      status: 'timed_out',
    });
  });

  it('rejects invalid retry and timeout bounds before execution', async () => {
    const engine = new WorkflowEngine(createMockNodeRegistry());

    await expect(
      engine.execute(singleDataNodeWorkflow(), {
        ...baseOptions,
        maxAttempts: 0,
      }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_EXECUTION_OPTIONS_INVALID',
    });

    await expect(
      engine.execute(singleDataNodeWorkflow(), {
        ...baseOptions,
        stepTimeoutMs: 600_001,
      }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_EXECUTION_OPTIONS_INVALID',
    });
  });
});
