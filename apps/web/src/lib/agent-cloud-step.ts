import 'server-only';

import {
  AgentCloudStepRequestSchema,
  AgentProtocolError,
  type AgentJob,
} from '@ai-workflow-studio/agent-protocol';

import { claimedJobCredentials } from './agent-api';
import { type AgentCloudNode, validateAgentCloudStepInput } from './agent-cloud-step-schema';
import { getAgentServerState } from './agent-server';

export type { AgentCloudNode } from './agent-cloud-step-schema';

const AGENT_CLOUD_NODE_TYPES = new Set([
  'ai.summarize',
  'report.compose',
  'google_slides.create',
  'apps_script.deploy_template',
]);

export async function authorizeAgentCloudStep(
  request: Request,
  jobId: string,
  nodeId: string,
  input: unknown,
): Promise<{
  readonly input: ReturnType<typeof AgentCloudStepRequestSchema.parse>['input'];
  readonly job: AgentJob;
  readonly node: AgentCloudNode;
}> {
  const parsed = AgentCloudStepRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AgentProtocolError(
      'AGENT_REQUEST_INVALID',
      'The cloud continuation request is invalid.',
    );
  }
  const job = await getAgentServerState().service.renewLease(
    claimedJobCredentials(request),
    jobId,
    { leaseSeconds: 120 },
  );
  const node = job.workflow.nodes.find(
    (candidate): candidate is AgentCloudNode =>
      candidate.id === nodeId && AGENT_CLOUD_NODE_TYPES.has(candidate.type),
  );
  if (node === undefined) {
    throw new AgentProtocolError(
      'AGENT_FORBIDDEN',
      'The claimed job does not authorize this cloud continuation step.',
    );
  }
  try {
    return { input: validateAgentCloudStepInput(node, parsed.data.input), job, node };
  } catch (error) {
    if (error instanceof AgentProtocolError) throw error;
    throw new AgentProtocolError(
      'AGENT_REQUEST_INVALID',
      'The cloud continuation input failed validation.',
      { cause: error },
    );
  }
}
