export type WorkflowEngineErrorCode =
  | 'NODE_EXECUTION_FAILED'
  | 'NODE_EXECUTION_TIMEOUT'
  | 'NODE_REGISTRATION_DUPLICATE'
  | 'RUN_CANCELLED'
  | 'WORKFLOW_APPROVAL_REQUIRED'
  | 'WORKFLOW_EXECUTION_OPTIONS_INVALID'
  | 'WORKFLOW_IDEMPOTENCY_KEY_INVALID'
  | 'WORKFLOW_NODE_UNKNOWN'
  | 'WORKFLOW_SCHEMA_INVALID';

export class WorkflowEngineError extends Error {
  readonly code: WorkflowEngineErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;

  constructor(
    code: WorkflowEngineErrorCode,
    message: string,
    options: {
      readonly cause?: unknown;
      readonly details?: Readonly<Record<string, unknown>>;
      readonly retryable?: boolean;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'WorkflowEngineError';
    this.code = code;
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? false;
  }
}

export function normalizeExecutionError(error: unknown, nodeId: string): WorkflowEngineError {
  if (error instanceof WorkflowEngineError) {
    return error;
  }

  return new WorkflowEngineError('NODE_EXECUTION_FAILED', `Node "${nodeId}" failed.`, {
    cause: error,
    details: { nodeId },
    retryable: false,
  });
}
