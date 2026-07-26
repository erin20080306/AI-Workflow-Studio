import { agentApiError, deviceCredentials } from '@/lib/agent-api';
import { getAgentServerState } from '@/lib/agent-server';

export async function GET(request: Request): Promise<Response> {
  try {
    const jobs = await getAgentServerState().service.listJobs(deviceCredentials(request));
    return Response.json(
      { jobs },
      {
        headers: { 'cache-control': 'no-store' },
      },
    );
  } catch (error) {
    return agentApiError(error);
  }
}

export const runtime = 'nodejs';
