import { expect, test } from '@playwright/test';

test('pairs an Agent and enforces claim, lease, idempotency, and revocation', async ({
  request,
}) => {
  const pairingStart = await request.post('/api/agent/pair/start', {
    data: { deviceName: 'Playwright Agent' },
  });
  expect(pairingStart.status()).toBe(201);
  const pairing = (await pairingStart.json()) as {
    readonly pairingCode: string;
  };
  expect(pairing.pairingCode).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/);

  const pairingComplete = await request.post('/api/agent/pair/complete', {
    data: {
      agentVersion: '0.1.0-e2e',
      pairingCode: pairing.pairingCode,
    },
  });
  expect(pairingComplete.status()).toBe(201);
  const paired = (await pairingComplete.json()) as {
    readonly device: { readonly id: string };
    readonly deviceToken: string;
  };
  expect(paired.deviceToken).toMatch(/^dvt_/);

  const agentHeaders = () => ({
    authorization: `Bearer ${paired.deviceToken}`,
    'x-request-timestamp': new Date().toISOString(),
  });
  const heartbeat = await request.post('/api/agent/heartbeat', {
    data: {
      agentVersion: '0.1.0-e2e',
      executorRunning: true,
      metadata: { platform: 'playwright' },
    },
    headers: agentHeaders(),
  });
  expect(heartbeat.ok()).toBe(true);

  const pendingJobs = await request.get('/api/agent/jobs', {
    headers: agentHeaders(),
  });
  expect(pendingJobs.ok()).toBe(true);
  const jobsPayload = (await pendingJobs.json()) as {
    readonly jobs: readonly { readonly id: string; readonly status: string }[];
  };
  expect(jobsPayload.jobs).toHaveLength(1);
  expect(jobsPayload.jobs[0]?.status).toBe('pending');
  const jobId = jobsPayload.jobs[0]?.id;
  expect(jobId).toBeTruthy();

  const firstClaim = await request.post(`/api/agent/jobs/${jobId}/claim`, {
    data: { leaseSeconds: 60 },
    headers: agentHeaders(),
  });
  expect(firstClaim.ok()).toBe(true);
  const claim = (await firstClaim.json()) as {
    readonly claimToken: string;
    readonly job: { readonly attempt: number; readonly status: string };
  };
  expect(claim.job).toMatchObject({ attempt: 1, status: 'claimed' });
  expect(claim.claimToken).toMatch(/^clm_/);

  const duplicateClaim = await request.post(`/api/agent/jobs/${jobId}/claim`, {
    data: { leaseSeconds: 60 },
    headers: agentHeaders(),
  });
  expect(duplicateClaim.status()).toBe(409);

  const claimHeaders = () => ({
    ...agentHeaders(),
    'x-job-claim-token': claim.claimToken,
  });
  const renewed = await request.post(`/api/agent/jobs/${jobId}/lease`, {
    data: { leaseSeconds: 120 },
    headers: claimHeaders(),
  });
  expect(renewed.ok()).toBe(true);

  const progressEventId = '10000000-0000-4000-8000-000000000721';
  const progressBody = {
    eventId: progressEventId,
    step: {
      nodeId: 'validate_orders',
      processedRowCount: 5,
      status: 'running',
    },
  };
  const firstProgress = await request.post(`/api/agent/jobs/${jobId}/progress`, {
    data: progressBody,
    headers: claimHeaders(),
  });
  expect(firstProgress.ok()).toBe(true);
  expect(await firstProgress.json()).toMatchObject({ duplicate: false });

  const duplicateProgress = await request.post(`/api/agent/jobs/${jobId}/progress`, {
    data: progressBody,
    headers: claimHeaders(),
  });
  expect(duplicateProgress.ok()).toBe(true);
  expect(await duplicateProgress.json()).toMatchObject({ duplicate: true });

  const completionBody = {
    eventId: '10000000-0000-4000-8000-000000000722',
    result: { processedRows: 5 },
  };
  const completion = await request.post(`/api/agent/jobs/${jobId}/complete`, {
    data: completionBody,
    headers: claimHeaders(),
  });
  expect(completion.ok()).toBe(true);
  expect(await completion.json()).toMatchObject({
    duplicate: false,
    job: { status: 'succeeded' },
  });

  const duplicateCompletion = await request.post(`/api/agent/jobs/${jobId}/complete`, {
    data: completionBody,
    headers: claimHeaders(),
  });
  expect(duplicateCompletion.ok()).toBe(true);
  expect(await duplicateCompletion.json()).toMatchObject({ duplicate: true });

  const revoke = await request.post(`/api/agent/devices/${paired.device.id}/revoke`);
  expect(revoke.ok()).toBe(true);
  const afterRevocation = await request.get('/api/agent/jobs', {
    headers: agentHeaders(),
  });
  expect(afterRevocation.status()).toBe(401);
});
