import 'server-only';

import {
  AgentCrypto,
  AgentProtocolError,
  AgentService,
  InMemoryAgentStore,
  type WebActor,
} from '@ai-workflow-studio/agent-protocol';
import type { AgentJob } from '@ai-workflow-studio/workflow-schema';
import { randomUUID } from 'node:crypto';

import { getEnvironment } from './env';

const MOCK_TENANT_ID = '10000000-0000-4000-8000-000000000701';
const MOCK_USER_ID = '10000000-0000-4000-8000-000000000702';
const MOCK_PEPPER = 'mock-mode-only-agent-pepper-never-use-in-production';

interface AgentServerState {
  readonly seededDevices: Set<string>;
  readonly service: AgentService;
  readonly store: InMemoryAgentStore;
}

const agentGlobal = globalThis as typeof globalThis & {
  __aiWorkflowAgentState?: AgentServerState;
};

function agentPepper(): string {
  const configured = process.env.AGENT_TOKEN_PEPPER;
  if (configured !== undefined && Buffer.byteLength(configured, 'utf8') >= 32) {
    return configured;
  }
  if (getEnvironment().mockMode) {
    return MOCK_PEPPER;
  }
  throw new AgentProtocolError(
    'AGENT_SERVER_NOT_CONFIGURED',
    'Agent API is not configured for this server.',
  );
}

function createState(): AgentServerState {
  const store = new InMemoryAgentStore();
  return {
    seededDevices: new Set(),
    service: new AgentService({
      crypto: new AgentCrypto({ pepper: agentPepper() }),
      store,
    }),
    store,
  };
}

export function getAgentServerState(): AgentServerState {
  agentGlobal.__aiWorkflowAgentState ??= createState();
  return agentGlobal.__aiWorkflowAgentState;
}

export function getWebActor(): WebActor {
  if (!getEnvironment().mockMode) {
    throw new AgentProtocolError(
      'AGENT_SERVER_NOT_CONFIGURED',
      'Authenticated tenant context is not configured for this server.',
    );
  }
  return {
    role: 'owner',
    tenantId: MOCK_TENANT_ID,
    userId: MOCK_USER_ID,
  };
}

export function seedMockJobForDevice(deviceId: string, tenantId: string): void {
  if (!getEnvironment().mockMode) {
    return;
  }
  const state = getAgentServerState();
  if (state.seededDevices.has(deviceId)) {
    return;
  }
  state.seededDevices.add(deviceId);
  const job: AgentJob = {
    attempt: 0,
    availableAt: new Date().toISOString(),
    deviceId,
    id: randomUUID(),
    idempotencyKey: `mock-job-${deviceId}`,
    maxAttempts: 3,
    status: 'pending',
    tenantId,
    workflow: {
      description: 'Mock Agent job used to verify the pairing and lease protocol.',
      edges: [],
      executionTarget: { deviceId, type: 'desktop' },
      name: 'Validate Mock orders',
      nodes: [
        {
          config: {
            onInvalid: 'fail',
            rules: [{ field: 'order_id', required: true }],
          },
          id: 'validate_orders',
          type: 'data.validate',
          version: 1,
        },
      ],
      schemaVersion: 1,
      trigger: { config: {}, type: 'manual.trigger' },
    },
    workflowRunId: randomUUID(),
  };
  state.store.seedJob(job);
}
