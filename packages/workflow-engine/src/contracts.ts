import type { JsonValue, RiskLevel } from '@ai-workflow-studio/workflow-schema';

export type ExecutionMode = 'dry-run' | 'live';

export interface WorkflowExecutionContext {
  readonly idempotencyKey: string;
  readonly mode: ExecutionMode;
  readonly nodeId: string;
  readonly now: () => Date;
  readonly runId: string;
  readonly signal: AbortSignal;
}

export interface NodeExecutionMetrics {
  readonly processedFileCount?: number;
  readonly processedRowCount?: number;
}

export interface NodeExecutionResult<TOutput> {
  readonly metrics?: NodeExecutionMetrics;
  readonly output: TOutput;
  readonly warnings?: readonly string[];
}

export interface WorkflowNodeExecutor<TConfig, TInput, TOutput> {
  readonly riskLevel: RiskLevel;
  readonly type: string;
  readonly version: number;

  validateConfig(config: unknown): TConfig;

  execute(
    context: WorkflowExecutionContext,
    input: TInput,
    config: TConfig,
  ): Promise<NodeExecutionResult<TOutput>>;
}

export type RegisteredWorkflowNodeExecutor = WorkflowNodeExecutor<JsonValue, JsonValue, JsonValue>;
