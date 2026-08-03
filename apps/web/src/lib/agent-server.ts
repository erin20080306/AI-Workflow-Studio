import 'server-only';

import {
  AgentCrypto,
  AgentProtocolError,
  AgentService,
  InMemoryAgentStore,
  type AgentStore,
  type WebActor,
} from '@ai-workflow-studio/agent-protocol';

import { requireWorkspaceActor } from './auth/context';
import { isAssistantAgentVersionCompatible } from './assistant-device-status';
import { getEnvironment } from './env';
import { SupabaseAgentStore } from './supabase-agent-store';

const MOCK_PEPPER = 'mock-mode-only-agent-pepper-never-use-in-production';

interface AgentServerState {
  readonly service: AgentService;
  readonly store: AgentStore;
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
  const environment = getEnvironment();
  const store = environment.mockMode ? new InMemoryAgentStore() : new SupabaseAgentStore();
  return {
    service: new AgentService({
      crypto: new AgentCrypto({ pepper: agentPepper() }),
      ...(environment.mockMode
        ? {}
        : { isAgentVersionSupported: isAssistantAgentVersionCompatible }),
      store,
    }),
    store,
  };
}

export function getAgentServerState(): AgentServerState {
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
