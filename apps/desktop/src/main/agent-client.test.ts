import { describe, expect, it, vi } from 'vitest';

import { AgentClient, type AgentFetch, type AgentClientStatus } from './agent-client';
import type { PairingSession } from './token-vault';

const DEVICE_ID = '10000000-0000-4000-8000-000000000821';
const TENANT_ID = '10000000-0000-4000-8000-000000000822';
const JOB_ID = '10000000-0000-4000-8000-000000000823';
const RUN_ID = '10000000-0000-4000-8000-000000000824';
const TOKEN = `dvt_${'B'.repeat(43)}`;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function pairingSession(): PairingSession {
  return {
    agentBaseUrl: 'https://agent.example.invalid',
    deviceId: DEVICE_ID,
    deviceName: 'Test Mac',
    deviceToken: TOKEN,
    expiresAt: '2026-10-24T06:00:00.000Z',
    tenantId: TENANT_ID,
  };
}

function jobPayload() {
  return {
    jobs: [
      {
        attempt: 0,
        availableAt: '2026-07-26T06:00:00.000Z',
        deviceId: DEVICE_ID,
        id: JOB_ID,
        idempotencyKey: 'desktop-test-job',
        maxAttempts: 3,
        status: 'pending',
        tenantId: TENANT_ID,
        workflow: {
          description: 'Test',
          edges: [],
          executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
          name: 'Validate',
          nodes: [
            {
              config: { onInvalid: 'fail', rules: [{ field: 'id', required: true }] },
              id: 'validate',
              type: 'data.validate',
              version: 1,
            },
          ],
          schemaVersion: 1,
          trigger: { config: {}, type: 'manual.trigger' },
        },
        workflowRunId: RUN_ID,
      },
    ],
  };
}

describe('AgentClient', () => {
  it('pairs, encrypts the session through its vault, heartbeats, and polls only its jobs', async () => {
    let stored: PairingSession | undefined;
    const requests: { readonly body?: string; readonly headers: Headers; readonly url: string }[] =
      [];
    const fetchTransport: AgentFetch = async (input, init) => {
      const url = String(input);
      requests.push({
        ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        headers: new Headers(init?.headers),
        url,
      });
      if (url.endsWith('/pair/complete')) {
        return jsonResponse({
          device: {
            id: DEVICE_ID,
            name: 'Test Mac',
            status: 'online',
            tenantId: TENANT_ID,
          },
          deviceToken: TOKEN,
          expiresAt: '2026-10-24T06:00:00.000Z',
        });
      }
      if (url.endsWith('/heartbeat')) {
        return jsonResponse({
          acceptedAt: new Date().toISOString(),
          deviceStatus: 'online',
        });
      }
      return jsonResponse(jobPayload());
    };
    const statuses: AgentClientStatus[] = [];
    const client = new AgentClient({
      agentVersion: '0.1.0-test',
      fetchTransport,
      listFolderAliases: async () => [
        {
          displayName: 'Approved imports',
          folderAliasId: '10000000-0000-4000-8000-000000000825',
          permissions: { read: true, watch: false, write: false },
        },
      ],
      logger: { info: vi.fn(), warn: vi.fn() },
      onStatus: (status) => statuses.push(status),
      vault: {
        async clear() {
          stored = undefined;
        },
        async load() {
          return stored;
        },
        async save(session) {
          stored = structuredClone(session);
        },
      },
    });

    await client.initialize();
    await client.pair('https://agent.example.invalid', 'ABCD2345EFGH');
    const jobs = await client.pollOnce();

    expect(stored?.deviceToken).toBe(TOKEN);
    expect(jobs).toHaveLength(1);
    expect(statuses.at(-1)).toMatchObject({
      connection: 'online',
      pendingJobCount: 1,
    });
    expect(requests[0]?.body).not.toContain(TOKEN);
    expect(requests[1]?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(requests[1]?.body).not.toContain(TENANT_ID);
    expect(requests[1]?.body).not.toContain('/Users/');
    expect(JSON.parse(requests[1]?.body ?? '{}')).toMatchObject({
      metadata: {
        folderAliases: [
          {
            displayName: 'Approved imports',
            folderAliasId: '10000000-0000-4000-8000-000000000825',
            permissions: { read: true, watch: false, write: false },
          },
        ],
      },
    });
    expect(requests[2]?.url).toBe('https://agent.example.invalid/api/agent/jobs');
  });

  it('enters bounded reconnect state after a polling failure and can be stopped', async () => {
    vi.useFakeTimers();
    const statuses: AgentClientStatus[] = [];
    const client = new AgentClient({
      agentVersion: '0.1.0-test',
      fetchTransport: async () => {
        throw new TypeError('network unavailable');
      },
      logger: { info: vi.fn(), warn: vi.fn() },
      onStatus: (status) => statuses.push(status),
      vault: {
        async clear() {},
        async load() {
          return pairingSession();
        },
        async save() {},
      },
    });
    await client.initialize();

    client.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(statuses.at(-1)?.connection).toBe('reconnecting');
    client.stop();
    expect(client.isExecutorRunning()).toBe(false);
    vi.useRealTimers();
  });

  it('claims each pending job once, reports progress, and completes it', async () => {
    let completed = false;
    const requests: { readonly body?: string; readonly url: string }[] = [];
    const pendingJob = jobPayload().jobs[0];
    const fetchTransport: AgentFetch = async (input, init) => {
      const url = String(input);
      requests.push({
        ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        url,
      });
      if (url.endsWith('/heartbeat')) {
        return jsonResponse({
          acceptedAt: new Date().toISOString(),
          deviceStatus: 'online',
        });
      }
      if (url.endsWith('/jobs')) {
        return jsonResponse(completed ? { jobs: [] } : jobPayload());
      }
      if (url.endsWith('/claim')) {
        return jsonResponse({
          claimToken: `clm_${'C'.repeat(43)}`,
          job: { ...pendingJob, attempt: 1, status: 'claimed' },
        });
      }
      if (url.endsWith('/progress')) {
        return jsonResponse({
          duplicate: false,
          job: { ...pendingJob, attempt: 1, status: 'running' },
        });
      }
      if (url.endsWith('/complete')) {
        completed = true;
        return jsonResponse({
          duplicate: false,
          job: { ...pendingJob, attempt: 1, status: 'succeeded' },
        });
      }
      return jsonResponse({ error: 'unexpected route' }, 404);
    };
    const executeJob = vi.fn(async (_job, reporter) => {
      await reporter.reportStep({
        nodeId: 'validate',
        processedRowCount: 3,
        status: 'succeeded',
      });
      return { processedRows: 3 };
    });
    const client = new AgentClient({
      agentVersion: '0.1.0-test',
      executeJob,
      fetchTransport,
      logger: { info: vi.fn(), warn: vi.fn() },
      onStatus: vi.fn(),
      vault: {
        async clear() {},
        async load() {
          return pairingSession();
        },
        async save() {},
      },
    });
    await client.initialize();

    await client.processOnce();
    await client.processOnce();

    expect(executeJob).toHaveBeenCalledTimes(1);
    expect(requests.filter((request) => request.url.endsWith('/claim'))).toHaveLength(1);
    expect(requests.filter((request) => request.url.endsWith('/progress'))[0]?.body).toContain(
      '"processedRowCount":3',
    );
    expect(requests.filter((request) => request.url.endsWith('/complete'))[0]?.body).toContain(
      '"processedRows":3',
    );
  });
});
