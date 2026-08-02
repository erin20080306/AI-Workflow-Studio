import { agentApiError, readAgentCloudStepJson } from '@/lib/agent-api';
import { authorizeAgentCloudStep } from '@/lib/agent-cloud-step';
import { executeProductionAgentCloudStep } from '@/lib/production-run-server';

export async function POST(
  request: Request,
  context: {
    readonly params: Promise<{ readonly jobId: string; readonly nodeId: string }>;
  },
): Promise<Response> {
  try {
    const { jobId, nodeId } = await context.params;
    const body = await readAgentCloudStepJson(request);
    const authorized = await authorizeAgentCloudStep(request, jobId, nodeId, body);
    const result = await executeProductionAgentCloudStep(
      authorized.job,
      authorized.node,
      authorized.input,
      request.signal,
    );
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return agentApiError(error);
  }
}

export const maxDuration = 800;
export const runtime = 'nodejs';
