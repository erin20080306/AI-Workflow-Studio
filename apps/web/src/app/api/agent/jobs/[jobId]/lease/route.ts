import { agentApiError, claimedJobCredentials, readAgentJson } from '@/lib/agent-api';
import { getAgentServerState } from '@/lib/agent-server';

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly jobId: string }> },
): Promise<Response> {
  try {
    const { jobId } = await context.params;
    const job = await getAgentServerState().service.renewLease(
      claimedJobCredentials(request),
      jobId,
      await readAgentJson(request),
    );
    return Response.json(
      { job },
      {
        headers: { 'cache-control': 'no-store' },
      },
    );
  } catch (error) {
    return agentApiError(error);
  }
}

export const runtime = 'nodejs';
