import {
  JsonValueSchema,
  NODE_CATALOG_BY_TYPE,
  summarizeWorkflowRisks,
  validateWorkflow,
  type JsonValue,
  type Workflow,
  type WorkflowNode,
  type WorkflowRiskSummary,
} from '@ai-workflow-studio/workflow-schema';

import type {
  ExecutionMode,
  NodeExecutionMetrics,
  RegisteredWorkflowNodeExecutor,
  WorkflowExecutionContext,
} from './contracts';
import {
  normalizeExecutionError,
  WorkflowEngineError,
  type WorkflowEngineErrorCode,
} from './errors';
import { InMemoryIdempotencyStore, type IdempotencyStore } from './idempotency';
import { NodeRegistry } from './registry';

export type WorkflowExecutionStatus = 'cancelled' | 'failed' | 'succeeded';
export type WorkflowStepStatus = 'cancelled' | 'failed' | 'planned' | 'succeeded' | 'timed_out';

export interface WorkflowExecutionStep {
  readonly attempts: number;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly error?: {
    readonly code: WorkflowEngineErrorCode;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly metrics: NodeExecutionMetrics;
  readonly nodeId: string;
  readonly nodeType: string;
  readonly output?: JsonValue;
  readonly startedAt: string;
  readonly status: WorkflowStepStatus;
  readonly warnings: readonly string[];
}

export interface WorkflowExecutionResult {
  readonly completedAt: string;
  readonly duplicate: boolean;
  readonly idempotencyKey: string;
  readonly mode: ExecutionMode;
  readonly riskSummary: WorkflowRiskSummary;
  readonly runId: string;
  readonly startedAt: string;
  readonly status: WorkflowExecutionStatus;
  readonly steps: readonly WorkflowExecutionStep[];
}

export interface WorkflowProgressEvent {
  readonly nodeId: string;
  readonly runId: string;
  readonly status: WorkflowStepStatus | 'running';
}

export interface WorkflowExecutionOptions {
  readonly approvedNodeIds?: readonly string[];
  readonly completedNodeOutputs?: Readonly<Record<string, JsonValue>>;
  readonly idempotencyKey: string;
  readonly initialInput?: JsonValue;
  readonly longTermApprovedNodeIds?: readonly string[];
  readonly maxAttempts?: number;
  readonly mode: ExecutionMode;
  readonly now?: () => Date;
  readonly onProgress?: (event: WorkflowProgressEvent) => Promise<void> | void;
  readonly runId: string;
  readonly signal?: AbortSignal;
  readonly stepTimeoutMs?: number;
}

function topologicalOrder(workflow: Workflow): readonly WorkflowNode[] {
  const nodesById = new Map(workflow.nodes.map((workflowNode) => [workflowNode.id, workflowNode]));
  const adjacency = new Map<string, string[]>(
    workflow.nodes.map((workflowNode) => [workflowNode.id, []]),
  );
  const inDegree = new Map<string, number>(
    workflow.nodes.map((workflowNode) => [workflowNode.id, 0]),
  );

  for (const edge of workflow.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId)
    .sort();
  const ordered: WorkflowNode[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeId === undefined) {
      break;
    }
    const workflowNode = nodesById.get(nodeId);
    if (workflowNode !== undefined) {
      ordered.push(workflowNode);
    }

    for (const targetId of adjacency.get(nodeId) ?? []) {
      const degree = (inDegree.get(targetId) ?? 0) - 1;
      inDegree.set(targetId, degree);
      if (degree === 0) {
        queue.push(targetId);
        queue.sort();
      }
    }
  }

  return ordered;
}

function predecessorIds(workflow: Workflow): ReadonlyMap<string, readonly string[]> {
  const predecessors = new Map<string, string[]>(
    workflow.nodes.map((workflowNode) => [workflowNode.id, []]),
  );
  for (const edge of workflow.edges) {
    predecessors.get(edge.to)?.push(edge.from);
  }
  for (const values of predecessors.values()) {
    values.sort();
  }
  return predecessors;
}

function inputForNode(
  nodeId: string,
  predecessors: ReadonlyMap<string, readonly string[]>,
  outputs: ReadonlyMap<string, JsonValue>,
  initialInput: JsonValue,
): JsonValue {
  const sourceNodeIds = predecessors.get(nodeId) ?? [];
  if (sourceNodeIds.length === 0) {
    return initialInput;
  }
  if (sourceNodeIds.length === 1) {
    return outputs.get(sourceNodeIds[0] ?? '') ?? null;
  }
  return sourceNodeIds.map((sourceNodeId) => outputs.get(sourceNodeId) ?? null);
}

function validateApprovals(
  workflow: Workflow,
  options: WorkflowExecutionOptions,
): readonly string[] {
  if (options.mode === 'dry-run') {
    return [];
  }

  const approved = new Set(options.approvedNodeIds ?? []);
  const longTermApproved = new Set(options.longTermApprovedNodeIds ?? []);
  const missing: string[] = [];

  for (const workflowNode of workflow.nodes) {
    const definition = NODE_CATALOG_BY_TYPE.get(workflowNode.type);
    if (definition?.approvalMode === 'always' && !approved.has(workflowNode.id)) {
      missing.push(workflowNode.id);
    }
    if (
      definition?.approvalMode === 'first_run' &&
      !approved.has(workflowNode.id) &&
      !longTermApproved.has(workflowNode.id)
    ) {
      missing.push(workflowNode.id);
    }
  }

  return missing;
}

async function executeWithTimeout(
  executor: RegisteredWorkflowNodeExecutor,
  context: WorkflowExecutionContext,
  input: JsonValue,
  config: JsonValue,
  timeoutMs: number,
  controller: AbortController,
): Promise<Awaited<ReturnType<RegisteredWorkflowNodeExecutor['execute']>>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort('step_timeout');
      reject(
        new WorkflowEngineError(
          'NODE_EXECUTION_TIMEOUT',
          `Node "${context.nodeId}" exceeded ${timeoutMs}ms.`,
          {
            details: { nodeId: context.nodeId, timeoutMs },
            retryable: true,
          },
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([executor.execute(context, input, config), timeoutPromise]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function dryRunOutput(workflowNode: WorkflowNode, input: JsonValue): JsonValue {
  return {
    inputAvailable: input !== null,
    mode: 'dry-run',
    nodeType: workflowNode.type,
    nodeVersion: workflowNode.version,
  };
}

export class WorkflowEngine {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly idempotencyStore: IdempotencyStore = new InMemoryIdempotencyStore(),
  ) {}

  async execute(
    input: unknown,
    options: WorkflowExecutionOptions,
  ): Promise<WorkflowExecutionResult> {
    if (options.idempotencyKey.trim().length < 8) {
      throw new WorkflowEngineError(
        'WORKFLOW_IDEMPOTENCY_KEY_INVALID',
        'Workflow idempotency key must contain at least eight characters.',
      );
    }
    if (
      (options.maxAttempts !== undefined &&
        (!Number.isInteger(options.maxAttempts) ||
          options.maxAttempts < 1 ||
          options.maxAttempts > 20)) ||
      (options.stepTimeoutMs !== undefined &&
        (!Number.isInteger(options.stepTimeoutMs) ||
          options.stepTimeoutMs < 1 ||
          options.stepTimeoutMs > 600_000))
    ) {
      throw new WorkflowEngineError(
        'WORKFLOW_EXECUTION_OPTIONS_INVALID',
        'Execution options must use 1-20 attempts and a 1-600000ms step timeout.',
        {
          details: {
            maxAttempts: options.maxAttempts,
            stepTimeoutMs: options.stepTimeoutMs,
          },
        },
      );
    }

    const validation = validateWorkflow(input);
    if (!validation.success || validation.workflow === undefined) {
      throw new WorkflowEngineError('WORKFLOW_SCHEMA_INVALID', 'Workflow validation failed.', {
        details: { issues: validation.issues },
      });
    }
    const workflow = validation.workflow;
    const workflowNodeIds = new Set(workflow.nodes.map((node) => node.id));
    const completedNodeOutputs = new Map<string, JsonValue>();
    for (const [nodeId, output] of Object.entries(options.completedNodeOutputs ?? {})) {
      if (!workflowNodeIds.has(nodeId)) {
        throw new WorkflowEngineError(
          'WORKFLOW_EXECUTION_OPTIONS_INVALID',
          'Completed workflow output references an unknown node.',
          { details: { nodeId } },
        );
      }
      completedNodeOutputs.set(nodeId, JsonValueSchema.parse(output));
    }

    for (const workflowNode of workflow.nodes) {
      if (!this.registry.has(workflowNode.type, workflowNode.version)) {
        throw new WorkflowEngineError(
          'WORKFLOW_NODE_UNKNOWN',
          `Node executor "${workflowNode.type}" version ${workflowNode.version} is not registered.`,
          { details: { nodeId: workflowNode.id, type: workflowNode.type } },
        );
      }
    }

    const idempotencyScope = `${options.mode}:${options.idempotencyKey}`;
    const cached = await this.idempotencyStore.get(idempotencyScope);
    if (cached !== undefined) {
      return { ...cached, duplicate: true };
    }

    const missingApprovalNodeIds = validateApprovals(workflow, options);
    if (missingApprovalNodeIds.length > 0) {
      throw new WorkflowEngineError(
        'WORKFLOW_APPROVAL_REQUIRED',
        'Workflow contains nodes that require approval.',
        { details: { nodeIds: missingApprovalNodeIds } },
      );
    }

    const now = options.now ?? (() => new Date());
    const startedAtDate = now();
    const riskSummary = summarizeWorkflowRisks(workflow);
    const orderedNodes = topologicalOrder(workflow);
    const predecessors = predecessorIds(workflow);
    const outputs = new Map<string, JsonValue>(completedNodeOutputs);
    const steps: WorkflowExecutionStep[] = [];
    const initialInput = JsonValueSchema.parse(options.initialInput ?? null);
    const maxAttempts = options.maxAttempts ?? 2;
    const stepTimeoutMs = options.stepTimeoutMs ?? 30_000;

    for (const workflowNode of orderedNodes) {
      if (options.signal?.aborted === true) {
        const cancelledAt = now().toISOString();
        steps.push({
          attempts: 0,
          completedAt: cancelledAt,
          durationMs: 0,
          metrics: {},
          nodeId: workflowNode.id,
          nodeType: workflowNode.type,
          startedAt: cancelledAt,
          status: 'cancelled',
          warnings: [],
        });
        const cancelledResult: WorkflowExecutionResult = {
          completedAt: cancelledAt,
          duplicate: false,
          idempotencyKey: options.idempotencyKey,
          mode: options.mode,
          riskSummary,
          runId: options.runId,
          startedAt: startedAtDate.toISOString(),
          status: 'cancelled',
          steps,
        };
        return cancelledResult;
      }

      const stepStartedAt = now();
      const nodeInput = inputForNode(workflowNode.id, predecessors, outputs, initialInput);

      const completedOutput = completedNodeOutputs.get(workflowNode.id);
      if (completedOutput !== undefined) {
        const completedAt = now();
        steps.push({
          attempts: 0,
          completedAt: completedAt.toISOString(),
          durationMs: Math.max(0, completedAt.getTime() - stepStartedAt.getTime()),
          metrics: {},
          nodeId: workflowNode.id,
          nodeType: workflowNode.type,
          output: completedOutput,
          startedAt: stepStartedAt.toISOString(),
          status: 'succeeded',
          warnings: ['Restored from a validated durable checkpoint.'],
        });
        await options.onProgress?.({
          nodeId: workflowNode.id,
          runId: options.runId,
          status: 'succeeded',
        });
        continue;
      }

      await options.onProgress?.({
        nodeId: workflowNode.id,
        runId: options.runId,
        status: 'running',
      });

      if (options.mode === 'dry-run') {
        const output = dryRunOutput(workflowNode, nodeInput);
        outputs.set(workflowNode.id, output);
        const completedAt = now();
        const step: WorkflowExecutionStep = {
          attempts: 0,
          completedAt: completedAt.toISOString(),
          durationMs: Math.max(0, completedAt.getTime() - stepStartedAt.getTime()),
          metrics: {},
          nodeId: workflowNode.id,
          nodeType: workflowNode.type,
          output,
          startedAt: stepStartedAt.toISOString(),
          status: 'planned',
          warnings: [],
        };
        steps.push(step);
        await options.onProgress?.({
          nodeId: workflowNode.id,
          runId: options.runId,
          status: 'planned',
        });
        continue;
      }

      const executor = this.registry.get(workflowNode.type, workflowNode.version);
      const config = executor.validateConfig(workflowNode.config);
      let attempt = 0;
      let stepCompleted = false;

      while (!stepCompleted && attempt < maxAttempts) {
        attempt += 1;
        const controller = new AbortController();
        const abortListener = () => controller.abort(options.signal?.reason);
        options.signal?.addEventListener('abort', abortListener, { once: true });

        try {
          const result = await executeWithTimeout(
            executor,
            {
              idempotencyKey: options.idempotencyKey,
              mode: options.mode,
              nodeId: workflowNode.id,
              now,
              runId: options.runId,
              signal: controller.signal,
            },
            nodeInput,
            config,
            stepTimeoutMs,
            controller,
          );
          const completedAt = now();
          outputs.set(workflowNode.id, JsonValueSchema.parse(result.output));
          const step: WorkflowExecutionStep = {
            attempts: attempt,
            completedAt: completedAt.toISOString(),
            durationMs: Math.max(0, completedAt.getTime() - stepStartedAt.getTime()),
            metrics: result.metrics ?? {},
            nodeId: workflowNode.id,
            nodeType: workflowNode.type,
            output: result.output,
            startedAt: stepStartedAt.toISOString(),
            status: 'succeeded',
            warnings: result.warnings ?? [],
          };
          steps.push(step);
          await options.onProgress?.({
            nodeId: workflowNode.id,
            runId: options.runId,
            status: 'succeeded',
          });
          stepCompleted = true;
        } catch (error) {
          const normalized = normalizeExecutionError(error, workflowNode.id);
          const runWasAborted = options.signal?.aborted ?? false;
          if (normalized.retryable && attempt < maxAttempts && !runWasAborted) {
            continue;
          }

          const completedAt = now();
          const timedOut = normalized.code === 'NODE_EXECUTION_TIMEOUT';
          const failedStep: WorkflowExecutionStep = {
            attempts: attempt,
            completedAt: completedAt.toISOString(),
            durationMs: Math.max(0, completedAt.getTime() - stepStartedAt.getTime()),
            error: {
              code: normalized.code,
              message: normalized.message,
              retryable: normalized.retryable,
            },
            metrics: {},
            nodeId: workflowNode.id,
            nodeType: workflowNode.type,
            startedAt: stepStartedAt.toISOString(),
            status: timedOut ? 'timed_out' : 'failed',
            warnings: [],
          };
          steps.push(failedStep);
          await options.onProgress?.({
            nodeId: workflowNode.id,
            runId: options.runId,
            status: failedStep.status,
          });

          return {
            completedAt: completedAt.toISOString(),
            duplicate: false,
            idempotencyKey: options.idempotencyKey,
            mode: options.mode,
            riskSummary,
            runId: options.runId,
            startedAt: startedAtDate.toISOString(),
            status: 'failed',
            steps,
          };
        } finally {
          options.signal?.removeEventListener('abort', abortListener);
        }
      }
    }

    const completedResult: WorkflowExecutionResult = {
      completedAt: now().toISOString(),
      duplicate: false,
      idempotencyKey: options.idempotencyKey,
      mode: options.mode,
      riskSummary,
      runId: options.runId,
      startedAt: startedAtDate.toISOString(),
      status: 'succeeded',
      steps,
    };
    await this.idempotencyStore.record(idempotencyScope, completedResult);
    return completedResult;
  }
}
