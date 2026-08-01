import { timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { getEnvironment } from '@/lib/env';
import { MOCK_SCHEDULE_CRON_SECRET, tickSchedules } from '@/lib/schedule-server';

const CronSecretSchema = z.string().min(24).max(500);

function authorized(request: Request): boolean {
  const header = request.headers.get('authorization');
  const supplied = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = getEnvironment().mockMode
    ? MOCK_SCHEDULE_CRON_SECRET
    : (process.env.CRON_SECRET ?? '');
  const suppliedBuffer = Buffer.from(supplied, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return (
    CronSecretSchema.safeParse(expected).success &&
    suppliedBuffer.byteLength === expectedBuffer.byteLength &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json(
      { error: { code: 'SCHEDULE_FORBIDDEN', message: 'Cron authorization is required.' } },
      { headers: { 'cache-control': 'no-store' }, status: 401 },
    );
  }
  try {
    const url = new URL(request.url);
    const requestedAt = url.searchParams.get('at');
    const at =
      getEnvironment().mockMode && requestedAt !== null ? new Date(requestedAt) : new Date();
    if (!Number.isFinite(at.getTime())) {
      return Response.json(
        { error: { code: 'SCHEDULE_INVALID', message: 'Tick time is invalid.' } },
        { headers: { 'cache-control': 'no-store' }, status: 400 },
      );
    }
    return Response.json(await tickSchedules(at), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json(
      {
        error: {
          code: 'SCHEDULE_DISPATCH_UNAVAILABLE',
          message: 'Scheduled dispatch is unavailable.',
        },
      },
      { headers: { 'cache-control': 'no-store' }, status: 503 },
    );
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 800;
