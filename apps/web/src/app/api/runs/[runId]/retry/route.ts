import { runApiError } from '@/lib/run-api';
import { retryRun } from '@/lib/run-server';

export async function POST(
  _request: Request,
  context: { readonly params: Promise<{ readonly runId: string }> },
): Promise<Response> {
  try {
    return Response.json(
      { run: await retryRun((await context.params).runId) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return runApiError(error);
  }
}

export const runtime = 'nodejs';
export const maxDuration = 800;
