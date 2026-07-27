import 'server-only';

import { ScheduleError } from '@ai-workflow-studio/scheduler';
import { z } from 'zod';

const statusByCode: Readonly<Record<ScheduleError['code'], number>> = {
  SCHEDULE_FORBIDDEN: 403,
  SCHEDULE_INVALID: 400,
  SCHEDULE_NOT_FOUND: 404,
  SCHEDULE_STATE_CONFLICT: 409,
};

export async function readScheduleJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > 16_000) {
    throw new ScheduleError('SCHEDULE_INVALID', 'The schedule request is too large.');
  }
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new ScheduleError('SCHEDULE_INVALID', 'The schedule request must contain JSON.');
  }
}

export function scheduleApiError(error: unknown): Response {
  const safe =
    error instanceof ScheduleError
      ? error
      : error instanceof z.ZodError
        ? new ScheduleError('SCHEDULE_INVALID', 'The schedule request is invalid.')
        : new ScheduleError(
            'SCHEDULE_STATE_CONFLICT',
            'The schedule request could not be completed.',
          );
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    {
      headers: { 'cache-control': 'no-store' },
      status: statusByCode[safe.code],
    },
  );
}
