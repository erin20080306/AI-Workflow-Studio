export type RunOrchestrationErrorCode =
  | 'RUN_APPROVAL_EXPIRED'
  | 'RUN_CONFLICT'
  | 'RUN_FORBIDDEN'
  | 'RUN_INVALID'
  | 'RUN_NOT_FOUND'
  | 'RUN_STATE_CONFLICT';

export class RunOrchestrationError extends Error {
  readonly code: RunOrchestrationErrorCode;

  constructor(code: RunOrchestrationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'RunOrchestrationError';
  }
}
