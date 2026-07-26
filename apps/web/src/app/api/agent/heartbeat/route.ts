import { agentApiError, deviceCredentials, readAgentJson } from '@/lib/agent-api';
import { getAgentServerState } from '@/lib/agent-server';

export async function POST(request: Request): Promise<Response> {
  try {
    const result = await getAgentServerState().service.heartbeat(
      deviceCredentials(request),
      await readAgentJson(request),
    );
    return Response.json(result, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return agentApiError(error);
  }
}

export const runtime = 'nodejs';
