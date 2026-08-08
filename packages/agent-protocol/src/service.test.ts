import type { AgentJob } from '@ai-workflow-studio/workflow-schema';
import { describe, expect, it } from 'vitest';

import { AgentCrypto } from './crypto';
import { AgentService, type ClaimedJobCredentials } from './service';
import { InMemoryAgentStore, type WebActor } from './store';

const TENANT_A = '10000000-0000-4000-8000-000000000701';
const TENANT_B = '10000000-0000-4000-8000-000000000702';
const USER_A = '10000000-0000-4000-8000-000000000703';
const USER_B = '10000000-0000-4000-8000-000000000704';
const JOB_A = '10000000-0000-4000-8000-000000000705';
const JOB_B = '10000000-0000-4000-8000-000000000706';
const RUN_A = '10000000-0000-4000-8000-000000000707';
const RUN_B = '10000000-0000-4000-8000-000000000708';
const EVENT_A = '10000000-0000-4000-8000-000000000709';
const PEPPER = 'phase-7-test-pepper-with-at-least-32-bytes';

interface Fixture {
  readonly actor: WebActor;
  readonly service: AgentService;
  readonly store: InMemoryAgentStore;
  advance(milliseconds: number): void;
  credentials(token: string): {
    readonly authorization: string;
    readonly requestTimestamp: string;
  };
  pair(actor?: WebActor): Promise<{
    readonly device: {
      readonly id: string;
      readonly name: string;
      readonly status: string;
      readonly tenantId: string;
    };
    readonly deviceToken: string;
    readonly expiresAt: string;
  }>;
}

function createFixture(options?: {
  readonly isAgentVersionSupported?: (agentVersion: string | undefined) => boolean;
}): Fixture {
  let now = new Date('2026-07-26T06:00:00.000Z');
  const store = new InMemoryAgentStore();
  const service = new AgentService({
    clock: () => new Date(now),
    crypto: new AgentCrypto({ pepper: PEPPER }),
    ...(options?.isAgentVersionSupported === undefined
      ? {}
      : { isAgentVersionSupported: options.isAgentVersionSupported }),
    store,
  });
  const actor: WebActor = {
    role: 'owner',
    tenantId: TENANT_A,
    userId: USER_A,
  };
  return {
    actor,
    advance(milliseconds) {
      now = new Date(now.getTime() + milliseconds);
    },
    credentials(token) {
      return {
        authorization: `Bearer ${token}`,
        requestTimestamp: now.toISOString(),
      };
    },
    async pair(pairingActor = actor) {
      const started = await service.startPairing(pairingActor, { deviceName: 'Test Mac' });
      return service.completePairing({
        agentVersion: '0.1.0-test',
        pairingCode: started.pairingCode,
      });
    },
    service,
    store,
  };
}

function job(
  id: string,
  tenantId: string,
  deviceId: string,
  workflowRunId: string,
  availableAt = '2026-07-26T06:00:00.000Z',
): AgentJob {
  return {
    attempt: 0,
    availableAt,
    deviceId,
    id,
    idempotencyKey: `job-${id}`,
    maxAttempts: 3,
    status: 'pending',
    tenantId,
    workflow: {
      description: 'Validate imported order identifiers.',
      edges: [],
      executionTarget: { deviceId, type: 'desktop' },
      name: 'Validate orders',
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
    workflowRunId,
  };
}

describe('AgentService', () => {
  it('pairs once and stores only HMAC hashes for pairing and device tokens', async () => {
    const fixture = createFixture();
    const started = await fixture.service.startPairing(fixture.actor, {
      deviceName: 'Finance Mac',
    });
    const completed = await fixture.service.completePairing({
      agentVersion: '0.1.0-test',
      pairingCode: started.pairingCode,
    });
    const snapshot = fixture.store.snapshot();

    expect(started.pairingCode).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/);
    expect(completed.deviceToken).toMatch(/^dvt_/);
    expect(snapshot.pairings[0]?.codeHash).not.toContain(started.pairingCode);
    expect(snapshot.tokens[0]?.tokenHash).not.toContain(completed.deviceToken);
    expect(JSON.stringify(snapshot)).not.toContain(completed.deviceToken);
    await expect(
      fixture.service.completePairing({
        agentVersion: '0.1.0-test',
        pairingCode: started.pairingCode,
      }),
    ).rejects.toMatchObject({ code: 'AGENT_PAIRING_INVALID' });
  });

  it('accepts a current authenticated heartbeat and derives tenant/device from the token', async () => {
    const fixture = createFixture();
    const paired = await fixture.pair();
    const result = await fixture.service.heartbeat(fixture.credentials(paired.deviceToken), {
      agentVersion: '0.1.1-test',
      executorRunning: true,
      metadata: { platform: 'darwin' },
    });
    const heartbeat = fixture.store.snapshot().heartbeats[0];

    expect(result.deviceStatus).toBe('online');
    expect(heartbeat).toMatchObject({
      deviceId: paired.device.id,
      tenantId: TENANT_A,
    });
  });

  it('allows only one active atomic claim and never stores its plaintext claim token', async () => {
    const fixture = createFixture();
    const paired = await fixture.pair();
    fixture.store.seedJob(job(JOB_A, TENANT_A, paired.device.id, RUN_A));
    const credentials = fixture.credentials(paired.deviceToken);
    const attempts = await Promise.allSettled([
      fixture.service.claimJob(credentials, JOB_A, { leaseSeconds: 60 }),
      fixture.service.claimJob(credentials, JOB_A, { leaseSeconds: 60 }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    const claim = attempts.find((attempt) => attempt.status === 'fulfilled');
    expect(claim?.value.claimToken).toMatch(/^clm_/);
    expect(JSON.stringify(fixture.store.snapshot())).not.toContain(claim?.value.claimToken);
  });

  it('hides pending jobs from an unsupported Agent and rejects a stale direct claim', async () => {
    const fixture = createFixture({
      isAgentVersionSupported: (agentVersion) => agentVersion === '0.2.0',
    });
    const paired = await fixture.pair();
    const credentials = fixture.credentials(paired.deviceToken);
    fixture.store.seedJob(job(JOB_A, TENANT_A, paired.device.id, RUN_A));

    await expect(fixture.service.listJobs(credentials)).resolves.toEqual([]);
    await expect(
      fixture.service.claimJob(credentials, JOB_A, { leaseSeconds: 60 }),
    ).rejects.toMatchObject({ code: 'AGENT_FORBIDDEN' });
    expect(fixture.store.snapshot().jobs[0]?.job.status).toBe('pending');

    await fixture.service.heartbeat(credentials, {
      agentVersion: '0.2.0',
      executorRunning: true,
      metadata: { platform: 'darwin' },
    });
    await expect(fixture.service.listJobs(credentials)).resolves.toHaveLength(1);
    await expect(
      fixture.service.claimJob(credentials, JOB_A, { leaseSeconds: 60 }),
    ).resolves.toMatchObject({ job: { status: 'claimed' } });
  });

  it('enforces token-derived tenant and device isolation for job claims', async () => {
    const fixture = createFixture();
    const pairedA = await fixture.pair();
    const actorB: WebActor = {
      role: 'owner',
      tenantId: TENANT_B,
      userId: USER_B,
    };
    const pairedB = await fixture.pair(actorB);
    fixture.store.seedJob(job(JOB_B, TENANT_B, pairedB.device.id, RUN_B));

    await expect(
      fixture.service.claimJob(fixture.credentials(pairedA.deviceToken), JOB_B, {
        leaseSeconds: 60,
      }),
    ).rejects.toMatchObject({ code: 'AGENT_JOB_CONFLICT' });
    expect(fixture.store.snapshot().jobs[0]?.job.status).toBe('pending');
  });

  it('rejects stale request timestamps and expired device tokens', async () => {
    const fixture = createFixture();
    const paired = await fixture.pair();
    const staleCredentials = fixture.credentials(paired.deviceToken);
    fixture.advance(6 * 60 * 1_000);

    await expect(fixture.service.listJobs(staleCredentials)).rejects.toMatchObject({
      code: 'AGENT_TIMESTAMP_INVALID',
    });

    fixture.advance(91 * 24 * 60 * 60 * 1_000);
    await expect(
      fixture.service.listJobs(fixture.credentials(paired.deviceToken)),
    ).rejects.toMatchObject({ code: 'AGENT_AUTHENTICATION_FAILED' });
  });

  it('renews only a live lease and rejects progress after expiry', async () => {
    const fixture = createFixture();
    const paired = await fixture.pair();
    fixture.store.seedJob(job(JOB_A, TENANT_A, paired.device.id, RUN_A));
    const claim = await fixture.service.claimJob(fixture.credentials(paired.deviceToken), JOB_A, {
      leaseSeconds: 60,
    });
    const claimedCredentials: ClaimedJobCredentials = {
      ...fixture.credentials(paired.deviceToken),
      claimToken: claim.claimToken,
    };
    const renewed = await fixture.service.renewLease(claimedCredentials, JOB_A, {
      leaseSeconds: 120,
    });
    expect(renewed.status).toBe('running');

    fixture.advance(121 * 1_000);
    await expect(
      fixture.service.recordProgress(
        {
          ...fixture.credentials(paired.deviceToken),
          claimToken: claim.claimToken,
        },
        JOB_A,
        {
          eventId: EVENT_A,
          step: { nodeId: 'validate_orders', status: 'running' },
        },
      ),
    ).rejects.toMatchObject({ code: 'AGENT_LEASE_EXPIRED' });
  });

  it('deduplicates progress/completion events and invalidates tokens on revocation', async () => {
    const fixture = createFixture();
    const paired = await fixture.pair();
    fixture.store.seedJob(job(JOB_A, TENANT_A, paired.device.id, RUN_A));
    const claim = await fixture.service.claimJob(fixture.credentials(paired.deviceToken), JOB_A, {
      leaseSeconds: 60,
    });
    const credentials: ClaimedJobCredentials = {
      ...fixture.credentials(paired.deviceToken),
      claimToken: claim.claimToken,
    };
    const progress = {
      eventId: EVENT_A,
      step: { nodeId: 'validate_orders', processedRowCount: 12, status: 'running' },
    };

    expect((await fixture.service.recordProgress(credentials, JOB_A, progress)).duplicate).toBe(
      false,
    );
    expect((await fixture.service.recordProgress(credentials, JOB_A, progress)).duplicate).toBe(
      true,
    );
    const completionId = '10000000-0000-4000-8000-000000000710';
    expect(
      (
        await fixture.service.completeJob(credentials, JOB_A, {
          eventId: completionId,
          result: { processedRows: 12 },
        })
      ).duplicate,
    ).toBe(false);
    expect(
      (
        await fixture.service.completeJob(credentials, JOB_A, {
          eventId: completionId,
          result: { processedRows: 12 },
        })
      ).duplicate,
    ).toBe(true);

    await fixture.service.revokeDevice(fixture.actor, paired.device.id);
    await expect(
      fixture.service.listJobs(fixture.credentials(paired.deviceToken)),
    ).rejects.toMatchObject({ code: 'AGENT_AUTHENTICATION_FAILED' });
    await expect(
      fixture.service.revokeDevice(fixture.actor, paired.device.id),
    ).rejects.toMatchObject({ code: 'AGENT_JOB_NOT_FOUND' });
  });

  it('records a bounded structured failure idempotently', async () => {
    const fixture = createFixture();
    const paired = await fixture.pair();
    fixture.store.seedJob(job(JOB_A, TENANT_A, paired.device.id, RUN_A));
    const claim = await fixture.service.claimJob(fixture.credentials(paired.deviceToken), JOB_A, {
      leaseSeconds: 60,
    });
    const credentials: ClaimedJobCredentials = {
      ...fixture.credentials(paired.deviceToken),
      claimToken: claim.claimToken,
    };
    const failure = {
      error: {
        code: 'EXCEL_FILE_LOCKED',
        message: 'The selected workbook is open in another application.',
        retryable: true,
      },
      eventId: '10000000-0000-4000-8000-000000000711',
    };

    expect((await fixture.service.failJob(credentials, JOB_A, failure)).job.status).toBe('failed');
    expect((await fixture.service.failJob(credentials, JOB_A, failure)).duplicate).toBe(true);
  });

  it('cancels active jobs and ignores duplicate job dispatches', async () => {
    const fixture = createFixture();
    const paired = await fixture.pair();
    const pendingJob = job(JOB_A, TENANT_A, paired.device.id, RUN_A);
    fixture.store.seedJob(pendingJob);
    fixture.store.seedJob({ ...pendingJob, status: 'succeeded' });

    expect(fixture.store.snapshot().jobs).toHaveLength(1);
    await expect(
      fixture.store.cancelJob(TENANT_B, JOB_A, new Date('2026-07-26T06:01:00.000Z')),
    ).resolves.toBe(false);
    await expect(
      fixture.store.cancelJob(TENANT_A, JOB_A, new Date('2026-07-26T06:01:00.000Z')),
    ).resolves.toBe(true);
    expect(fixture.store.snapshot().jobs[0]).toMatchObject({
      events: [{ type: 'cancelled' }],
      job: { status: 'cancelled' },
    });
    await expect(
      fixture.store.cancelJob(TENANT_A, JOB_A, new Date('2026-07-26T06:02:00.000Z')),
    ).resolves.toBe(false);
  });
});
