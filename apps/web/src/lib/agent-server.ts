import 'server-only';

import {
  AgentCrypto,
  AgentProtocolError,
  AgentService,
  InMemoryAgentStore,
  type WebActor,
} from '@ai-workflow-studio/agent-protocol';

import { requireWorkspaceActor } from './auth/context';
import { getEnvironment } from './env';

const MOCK_PEPPER = 'mock-mode-only-agent-pepper-never-use-in-production';

interface AgentServerState {
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
    service: new AgentService({
      crypto: new AgentCrypto({ pepper: agentPepper() }),
      store,
    }),
    store,
  };
}

export function getAgentServerState(): AgentServerState {
  if (!getEnvironment().mockMode) {
    throw new AgentProtocolError(
      'AGENT_SERVER_NOT_CONFIGURED',
      'Durable production Agent persistence is not configured.',
    );
  }
  agentGlobal.__aiWorkflowAgentState ??= createState();
  return agentGlobal.__aiWorkflowAgentState;
}

export async function getWebActor(): Promise<WebActor> {
  try {
    return await requireWorkspaceActor();
  } catch (error) {
    throw new AgentProtocolError('AGENT_FORBIDDEN', 'An authenticated workspace is required.', {
      cause: error,
    });
  }
}
