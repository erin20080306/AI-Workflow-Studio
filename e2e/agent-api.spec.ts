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

  const runStart = await request.post('/api/runs', {
    data: {
      deviceId: paired.device.id,
      idempotencyKey: `e2e-run-${paired.device.id}`,
      requiresApproval: true,
      timeoutSeconds: 300,
    },
  });
  expect(runStart.status()).toBe(201);
  const runStartPayload = (await runStart.json()) as {
    readonly duplicate: boolean;
    readonly run: {
      readonly approval?: { readonly id: string };
      readonly id: string;
      readonly status: string;
    };
  };
  expect(runStartPayload).toMatchObject({
    duplicate: false,
    run: { status: 'awaiting_approval' },
  });

  const whileOffline = await request.get('/api/agent/jobs', {
    headers: agentHeaders(),
  });
  expect(whileOffline.ok()).toBe(true);
  expect(await whileOffline.json()).toMatchObject({ jobs: [] });

  const approval = await request.post(`/api/runs/${runStartPayload.run.id}/approval`, {
    data: {
      approvalId: runStartPayload.run.approval?.id,
      decision: 'approve',
    },
  });
  expect(approval.ok()).toBe(true);
  expect(await approval.json()).toMatchObject({
    run: { attempts: 1, status: 'queued' },
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

  const progressBodies = [
    {
      eventId: '10000000-0000-4000-8000-000000000721',
      step: {
        nodeId: 'list_order_files',
        processedFileCount: 1,
        processedRowCount: 0,
        status: 'succeeded',
      },
    },
    {
      eventId: '10000000-0000-4000-8000-000000000723',
      step: {
        nodeId: 'read_order_files',
        processedFileCount: 1,
        processedRowCount: 6,
        status: 'succeeded',
      },
    },
    {
      eventId: '10000000-0000-4000-8000-000000000724',
      step: {
        nodeId: 'deduplicate_orders',
        processedFileCount: 1,
        processedRowCount: 5,
        status: 'succeeded',
      },
    },
    {
      eventId: '10000000-0000-4000-8000-000000000725',
      step: {
        nodeId: 'create_order_report',
        processedFileCount: 1,
        processedRowCount: 5,
        status: 'succeeded',
      },
    },
  ] as const;
  for (const progressBody of progressBodies) {
    const progress = await request.post(`/api/agent/jobs/${jobId}/progress`, {
      data: progressBody,
      headers: claimHeaders(),
    });
    expect(progress.ok()).toBe(true);
    expect(await progress.json()).toMatchObject({ duplicate: false });
  }

  const duplicateProgress = await request.post(`/api/agent/jobs/${jobId}/progress`, {
    data: progressBodies[0],
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

  const runDetails = await request.get(`/api/runs/${runStartPayload.run.id}`);
  expect(runDetails.ok()).toBe(true);
  expect(await runDetails.json()).toMatchObject({
    run: {
      attempts: 1,
      status: 'succeeded',
      steps: expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'create_order_report',
          processedRowCount: 5,
          status: 'succeeded',
        }),
      ]),
    },
  });

  const revoke = await request.post(`/api/agent/devices/${paired.device.id}/revoke`);
  expect(revoke.ok()).toBe(true);
  const afterRevocation = await request.get('/api/agent/jobs', {
    headers: agentHeaders(),
  });
  expect(afterRevocation.status()).toBe(401);
});
