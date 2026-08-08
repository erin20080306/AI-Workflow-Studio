import { describe, expect, it, vi } from 'vitest';

import {
  AgentClient,
  AgentHttpError,
  type AgentFetch,
  type AgentClientStatus,
  type SessionVault,
} from './agent-client';
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

function pairingClient(fetchTransport: AgentFetch, vault?: SessionVault): AgentClient {
  return new AgentClient({
    agentVersion: '0.2.0-test',
    fetchTransport,
    logger: { info: vi.fn(), warn: vi.fn() },
    onStatus: vi.fn(),
    vault:
      vault ??
      ({
        async clear() {},
        async load() {
          return undefined;
        },
        async save() {},
      } satisfies SessionVault),
  });
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
    const folderAliasWithLocalMetadata = {
      createdAt: '2026-08-01T00:00:00.000Z',
      displayName: 'Approved imports',
      folderAliasId: '10000000-0000-4000-8000-000000000825',
      permissions: { read: true, watch: false, write: false },
    };
    const client = new AgentClient({
      agentVersion: '0.1.0-test',
      fetchTransport,
      listFolderAliases: async () => [folderAliasWithLocalMetadata],
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
    expect(requests[1]?.body).not.toContain('createdAt');
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

  it('retains only an allowlisted Agent code from a pairing error response', async () => {
    const rawServerMessage = 'database constraint and private row details';
    const client = pairingClient(async () =>
      jsonResponse(
        {
          error: {
            code: 'AGENT_DEVICE_LIMIT_REACHED',
            message: rawServerMessage,
          },
        },
        409,
      ),
    );

    const error: unknown = await client
      .pair('https://agent.example.invalid', 'ABCD2345EFGH')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AgentHttpError);
    if (!(error instanceof AgentHttpError)) {
      throw new Error('Expected an AgentHttpError.');
    }
    expect(error.agentCode).toBe('AGENT_DEVICE_LIMIT_REACHED');
    expect(error.status).toBe(409);
    expect(error.message).not.toContain(rawServerMessage);
  });

  it('drops unknown and oversized pairing error bodies instead of retaining server details', async () => {
    const rawServerMessage = 'raw postgres failure that must remain server-side';
    const responses = [
      jsonResponse(
        {
          error: {
            code: 'POSTGRES_INTERNAL_FAILURE',
            message: rawServerMessage,
          },
        },
        500,
      ),
      jsonResponse(
        {
          error: {
            code: 'AGENT_PAIRING_INVALID',
            message: rawServerMessage.repeat(2_000),
          },
        },
        400,
      ),
    ];
    const client = pairingClient(async () => responses.shift() ?? jsonResponse({}, 500));

    for (let index = 0; index < 2; index += 1) {
      const error: unknown = await client
        .pair('https://agent.example.invalid', 'ABCD2345EFGH')
        .catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(AgentHttpError);
      if (!(error instanceof AgentHttpError)) {
        throw new Error('Expected an AgentHttpError.');
      }
      expect(error.agentCode).toBeUndefined();
      expect(error.message).not.toContain(rawServerMessage);
    }
  });

  it('bounds successful JSON before parsing it', async () => {
    const client = pairingClient(async () => jsonResponse({ padding: 'x'.repeat(1_000_001) }));

    await expect(client.pair('https://agent.example.invalid', 'ABCD2345EFGH')).rejects.toThrow(
      'Agent server response is too large.',
    );
  });

  it('checks secure storage before consuming a one-time pairing code', async () => {
    const fetchTransport = vi.fn(async () => jsonResponse({}));
    const client = pairingClient(fetchTransport, {
      async clear() {},
      async load() {
        return undefined;
      },
      async prepare() {
        throw new Error('Operating-system secure storage is unavailable.');
      },
      async save() {},
    });

    await expect(client.pair('https://agent.example.invalid', 'ABCD2345EFGH')).rejects.toThrow(
      'Operating-system secure storage is unavailable.',
    );
    expect(fetchTransport).not.toHaveBeenCalled();
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

  it('keeps independent heartbeats and wrapped lease renewal active during a long-running job', async () => {
    vi.useFakeTimers();
    let completed = false;
    let finishJob: (() => void) | undefined;
    let heartbeatRequestCount = 0;
    let leaseRequestCount = 0;
    const pendingJob = jobPayload().jobs[0];
    const jobBarrier = new Promise<void>((resolve) => {
      finishJob = resolve;
    });
    const fetchTransport: AgentFetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/heartbeat')) {
        heartbeatRequestCount += 1;
        return jsonResponse({ acceptedAt: new Date().toISOString(), deviceStatus: 'online' });
      }
      if (url.endsWith('/jobs')) return jsonResponse(completed ? { jobs: [] } : jobPayload());
      if (url.endsWith('/claim')) {
        return jsonResponse({
          claimToken: `clm_${'C'.repeat(43)}`,
          job: { ...pendingJob, attempt: 1, status: 'claimed' },
        });
      }
      if (url.endsWith('/lease')) {
        leaseRequestCount += 1;
        return jsonResponse({
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
    const client = new AgentClient({
      agentVersion: '0.1.0-test',
      executeJob: async () => {
        await jobBarrier;
        return { processedRows: 3 };
      },
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

    const processing = client.processOnce();
    await vi.advanceTimersByTimeAsync(90_000);

    expect(heartbeatRequestCount).toBe(7);
    expect(leaseRequestCount).toBe(2);
    finishJob?.();
    await processing;
    expect(completed).toBe(true);
    vi.useRealTimers();
  });

  it('does not abort a leased job when its independent heartbeat temporarily fails', async () => {
    vi.useFakeTimers();
    let completed = false;
    let finishJob: (() => void) | undefined;
    let heartbeatRequestCount = 0;
    let jobSignal: AbortSignal | undefined;
    const pendingJob = jobPayload().jobs[0];
    const jobBarrier = new Promise<void>((resolve) => {
      finishJob = resolve;
    });
    const fetchTransport: AgentFetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/heartbeat')) {
        heartbeatRequestCount += 1;
        return heartbeatRequestCount === 1
          ? jsonResponse({ acceptedAt: new Date().toISOString(), deviceStatus: 'online' })
          : jsonResponse({ error: 'temporary heartbeat failure' }, 503);
      }
      if (url.endsWith('/jobs')) return jsonResponse(completed ? { jobs: [] } : jobPayload());
      if (url.endsWith('/claim')) {
        return jsonResponse({
          claimToken: `clm_${'C'.repeat(43)}`,
          job: { ...pendingJob, attempt: 1, status: 'claimed' },
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
    const logger = { info: vi.fn(), warn: vi.fn() };
    const client = new AgentClient({
      agentVersion: '0.1.0-test',
      executeJob: async (_job, reporter) => {
        jobSignal = reporter.signal;
        await jobBarrier;
        return { processedRows: 3 };
      },
      fetchTransport,
      logger,
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

    const processing = client.processOnce();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(heartbeatRequestCount).toBe(2);
    expect(jobSignal?.aborted).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      'AGENT_JOB_HEARTBEAT_FAILED',
      expect.any(String),
      expect.objectContaining({ jobId: JOB_ID, type: 'AgentHttpError' }),
    );
    finishJob?.();
    await processing;
    expect(completed).toBe(true);
    vi.useRealTimers();
  });

  it('aborts local execution when a heartbeat reports a revoked device session', async () => {
    vi.useFakeTimers();
    let jobSignal: AbortSignal | undefined;
    let heartbeatRequestCount = 0;
    const requests: string[] = [];
    const pendingJob = jobPayload().jobs[0];
    const fetchTransport: AgentFetch = async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith('/heartbeat')) {
        heartbeatRequestCount += 1;
        return heartbeatRequestCount === 1
          ? jsonResponse({ acceptedAt: new Date().toISOString(), deviceStatus: 'online' })
          : jsonResponse({ error: { code: 'AGENT_UNAUTHORIZED' } }, 401);
      }
      if (url.endsWith('/jobs')) return jsonResponse(jobPayload());
      if (url.endsWith('/claim')) {
        return jsonResponse({
          claimToken: `clm_${'C'.repeat(43)}`,
          job: { ...pendingJob, attempt: 1, status: 'claimed' },
        });
      }
      return jsonResponse({ error: 'unexpected route' }, 404);
    };
    const client = new AgentClient({
      agentVersion: '0.2.1-test',
      executeJob: async (_job, reporter) => {
        jobSignal = reporter.signal;
        await new Promise<void>((resolve) => {
          if (reporter.signal.aborted) {
            resolve();
            return;
          }
          reporter.signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
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

    const processing = client.processOnce();
    await vi.advanceTimersByTimeAsync(15_000);
    await processing;

    expect(heartbeatRequestCount).toBe(2);
    expect(jobSignal?.aborted).toBe(true);
    expect(requests.some((url) => url.endsWith('/complete'))).toBe(false);
    expect(requests.some((url) => url.endsWith('/fail'))).toBe(false);
    vi.useRealTimers();
  });

  it('uses the active claim for bounded Drive manifests and binary workbook transfers', async () => {
    let completed = false;
    const requestHeaders: { readonly headers: Headers; readonly url: string }[] = [];
    const pendingJob = jobPayload().jobs[0];
    const workbookBytes = new Uint8Array([80, 75, 3, 4]);
    const fetchTransport: AgentFetch = async (input, init) => {
      const url = String(input);
      requestHeaders.push({ headers: new Headers(init?.headers), url });
      if (url.endsWith('/heartbeat')) {
        return jsonResponse({ acceptedAt: new Date().toISOString(), deviceStatus: 'online' });
      }
      if (url.endsWith('/jobs')) return jsonResponse(completed ? { jobs: [] } : jobPayload());
      if (url.endsWith('/claim')) {
        return jsonResponse({
          claimToken: `clm_${'C'.repeat(43)}`,
          job: { ...pendingJob, attempt: 1, status: 'claimed' },
        });
      }
      if (url.endsWith('/manifest')) {
        return jsonResponse({
          expiresAt: '2026-08-01T12:00:00.000Z',
          files: [
            {
              downloadToken: 'signed-transfer-token-value-with-forty-characters',
              fileId: '1DriveWorkbookResource123456',
              fileName: 'cost.xlsx',
              mimeType: 'xlsx',
              size: workbookBytes.byteLength,
            },
          ],
          folderId: '1DriveFolderResource123456789',
        });
      }
      if (url.includes('/files/1DriveWorkbookResource123456?')) {
        return new Response(workbookBytes, {
          headers: { 'content-length': String(workbookBytes.byteLength) },
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
      const manifest = await reporter.listDriveExcelFiles('download_workbooks');
      const file = manifest.files[0];
      if (file === undefined) throw new Error('Expected a workbook manifest entry.');
      const downloaded = await reporter.downloadDriveExcelFile('download_workbooks', file);
      expect(downloaded).toEqual(workbookBytes);
      return { processedFiles: 1 };
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

    expect(executeJob).toHaveBeenCalledTimes(1);
    const transferRequests = requestHeaders.filter((request) =>
      request.url.includes('/drive-excel/'),
    );
    expect(transferRequests).toHaveLength(2);
    expect(
      transferRequests.every(
        (request) => request.headers.get('x-job-claim-token') === `clm_${'C'.repeat(43)}`,
      ),
    ).toBe(true);
    expect(transferRequests[1]?.url).toContain('token=signed-transfer-token-value');
  });
});
