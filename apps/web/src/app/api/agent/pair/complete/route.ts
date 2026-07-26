import { agentApiError, readAgentJson } from '@/lib/agent-api';
import { getAgentServerState, seedMockJobForDevice } from '@/lib/agent-server';

export async function POST(request: Request): Promise<Response> {
  try {
    const result = await getAgentServerState().service.completePairing(
      await readAgentJson(request),
    );
    seedMockJobForDevice(result.device.id, result.device.tenantId);
    return Response.json(result, {
      headers: { 'cache-control': 'no-store' },
      status: 201,
    });
  } catch (error) {
    return agentApiError(error);
  }
}

export const runtime = 'nodejs';
