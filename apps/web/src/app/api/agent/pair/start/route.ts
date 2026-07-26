import { agentApiError, readAgentJson } from '@/lib/agent-api';
import { getAgentServerState, getWebActor } from '@/lib/agent-server';

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await getWebActor();
    const result = await getAgentServerState().service.startPairing(
      actor,
      await readAgentJson(request),
    );
    return Response.json(result, {
      headers: { 'cache-control': 'no-store' },
      status: 201,
    });
  } catch (error) {
    return agentApiError(error);
  }
}

export const runtime = 'nodejs';
