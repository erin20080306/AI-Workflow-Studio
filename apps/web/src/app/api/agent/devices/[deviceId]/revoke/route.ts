import { agentApiError } from '@/lib/agent-api';
import { getAgentServerState, getWebActor } from '@/lib/agent-server';

export async function POST(
  _request: Request,
  context: { readonly params: Promise<{ readonly deviceId: string }> },
): Promise<Response> {
  try {
    const { deviceId } = await context.params;
    const actor = await getWebActor();
    const result = await getAgentServerState().service.revokeDevice(actor, deviceId);
    return Response.json(result, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return agentApiError(error);
  }
}

export const runtime = 'nodejs';
