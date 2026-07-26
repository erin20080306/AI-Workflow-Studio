import { readRunJson, runApiError } from '@/lib/run-api';
import { createMockRun, listRuns } from '@/lib/run-server';

export async function GET(): Promise<Response> {
  try {
    return Response.json({ runs: await listRuns() }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return runApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    return Response.json(await createMockRun(await readRunJson(request)), {
      headers: { 'cache-control': 'no-store' },
      status: 201,
    });
  } catch (error) {
    return runApiError(error);
  }
}

export const runtime = 'nodejs';
