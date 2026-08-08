import { AgentProtocolError } from '@ai-workflow-studio/agent-protocol';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { agentApiError } from './agent-api';

describe('agent API errors', () => {
  it('returns a conflict for the safe device-limit protocol error', async () => {
    const response = agentApiError(
      new AgentProtocolError(
        'AGENT_DEVICE_LIMIT_REACHED',
        'The workspace has reached its Desktop Agent device limit.',
      ),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'AGENT_DEVICE_LIMIT_REACHED',
        message: 'The workspace has reached its Desktop Agent device limit.',
      },
    });
  });
});
