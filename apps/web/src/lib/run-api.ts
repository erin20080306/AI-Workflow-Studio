import 'server-only';

import {
  RunOrchestrationError,
  type RunOrchestrationErrorCode,
} from '@ai-workflow-studio/run-orchestrator';
import { z } from 'zod';

const statusByCode: Readonly<Record<RunOrchestrationErrorCode, number>> = {
  RUN_APPROVAL_EXPIRED: 409,
  RUN_CONFLICT: 409,
  RUN_FORBIDDEN: 403,
  RUN_INVALID: 400,
  RUN_NOT_FOUND: 404,
  RUN_STATE_CONFLICT: 409,
};

export async function readRunJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > 32_000) {
    throw new RunOrchestrationError('RUN_INVALID', 'The run request is too large.');
  }
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new RunOrchestrationError('RUN_INVALID', 'The run request must contain JSON.');
  }
}

export function runApiError(error: unknown): Response {
  const safe =
    error instanceof RunOrchestrationError
      ? error
      : error instanceof z.ZodError
        ? new RunOrchestrationError('RUN_INVALID', 'The run request is invalid.')
        : new RunOrchestrationError(
            'RUN_STATE_CONFLICT',
            'The run request could not be completed.',
          );
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    {
      headers: { 'cache-control': 'no-store' },
      status: statusByCode[safe.code],
    },
  );
}
