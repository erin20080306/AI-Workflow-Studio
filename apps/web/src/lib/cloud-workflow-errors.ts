import { GoogleSheetsError } from '@ai-workflow-studio/google-sheets';
import { WorkflowEngineError } from '@ai-workflow-studio/workflow-engine';

export function safeGoogleNodeFailure(error: unknown, nodeId: string): unknown {
  if (!(error instanceof GoogleSheetsError)) return error;
  return new WorkflowEngineError(
    'NODE_EXECUTION_FAILED',
    `Node "${nodeId}" failed with ${error.code}.`,
    {
      cause: error,
      details: { googleErrorCode: error.code, nodeId },
      retryable: error.retryable,
    },
  );
}
