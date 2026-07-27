import { agentApiError, claimedJobCredentials, readAgentJson } from '@/lib/agent-api';
import { getAgentServerState } from '@/lib/agent-server';
import { syncAgentFailure } from '@/lib/run-server';

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly jobId: string }> },
): Promise<Response> {
  try {
    const { jobId } = await context.params;
    const input = await readAgentJson(request);
    const result = await getAgentServerState().service.failJob(
      claimedJobCredentials(request),
      jobId,
      input,
    );
    await syncAgentFailure(result.job, input);
    return Response.json(result, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return agentApiError(error);
  }
}

export const runtime = 'nodejs';
