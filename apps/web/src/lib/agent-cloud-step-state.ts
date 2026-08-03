import { createHash } from 'node:crypto';

import {
  JsonValueSchema,
  type JsonValue,
  type Workflow,
  type WorkflowNode,
} from '@ai-workflow-studio/workflow-schema';

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(',')}}`;
}

export function agentCloudInputHash(input: unknown): string {
  const parsed = JsonValueSchema.parse(input);
  return createHash('sha256').update(canonicalJson(parsed)).digest('hex');
}

export function agentCloudInputsEqual(left: unknown, right: unknown): boolean {
  return agentCloudInputHash(left) === agentCloudInputHash(right);
}

export function immediateAgentCloudPredecessor(workflow: Workflow, nodeId: string): WorkflowNode {
  const predecessorIds = workflow.edges
    .filter((edge) => edge.to === nodeId)
    .map((edge) => edge.from);
  if (predecessorIds.length !== 1) {
    throw new Error('A cloud continuation step must have exactly one immediate predecessor.');
  }
  const predecessor = workflow.nodes.find((node) => node.id === predecessorIds[0]);
  if (predecessor === undefined) {
    throw new Error('The cloud continuation predecessor is not part of the reviewed workflow.');
  }
  return predecessor;
}

export type AgentCloudClaimDisposition =
  'claim' | 'duplicate' | 'input_conflict' | 'in_progress' | 'state_conflict';

export function agentCloudClaimDisposition(
  step: {
    readonly inputSummary: Readonly<Record<string, unknown>>;
    readonly status: 'cancelled' | 'failed' | 'pending' | 'running' | 'succeeded' | 'timed_out';
  },
  inputHash: string,
): AgentCloudClaimDisposition {
  const storedHash =
    typeof step.inputSummary.agentCloudInputHash === 'string'
      ? step.inputSummary.agentCloudInputHash
      : undefined;
  if (storedHash !== undefined && storedHash !== inputHash) return 'input_conflict';
  if (step.status === 'succeeded') return storedHash === inputHash ? 'duplicate' : 'state_conflict';
  if (step.status === 'running') return 'in_progress';
  if (step.status !== 'pending') return 'state_conflict';
  return 'claim';
}
