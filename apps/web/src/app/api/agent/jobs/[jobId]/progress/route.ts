import { agentApiError, claimedJobCredentials, readAgentJson } from '@/lib/agent-api';
import { validateAgentProgressRequest } from '@/lib/agent-progress-schema';
import { getAgentServerState } from '@/lib/agent-server';
import { syncAgentProgress } from '@/lib/run-server';

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly jobId: string }> },
): Promise<Response> {
  try {
    const { jobId } = await context.params;
    const input = await readAgentJson(request);
    const credentials = claimedJobCredentials(request);
    const service = getAgentServerState().service;
    const job = await service.renewLease(credentials, jobId, { leaseSeconds: 120 });
    const safeInput = validateAgentProgressRequest(job, input);
    const result = await service.recordProgress(credentials, jobId, safeInput);
    await syncAgentProgress(result.job, safeInput);
    return Response.json(result, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return agentApiError(error);
  }
}

export const runtime = 'nodejs';
