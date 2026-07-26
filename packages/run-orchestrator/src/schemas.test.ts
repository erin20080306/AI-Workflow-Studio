import { describe, expect, it } from 'vitest';

import { WorkflowRunViewSchema } from './schemas';

const runView = {
  attempts: 1,
  audit: [],
  createdAt: '2026-07-26T12:00:00.000Z',
  deviceId: '10000000-0000-4000-8000-000000000001',
  id: '10000000-0000-4000-8000-000000000002',
  idempotencyKey: 'run-view-test',
  maxAttempts: 3,
  notifications: [],
  status: 'queued',
  steps: [
    {
      attempt: 1,
      nodeId: 'read_orders',
      nodeType: 'excel.read',
      processedFileCount: 0,
      processedRowCount: 0,
      status: 'pending',
    },
  ],
  tenantId: '10000000-0000-4000-8000-000000000003',
  timeoutAt: '2026-07-26T12:30:00.000Z',
  workflowId: '10000000-0000-4000-8000-000000000004',
  workflowName: 'Order summary',
  workflowVersionId: '10000000-0000-4000-8000-000000000005',
} as const;

describe('WorkflowRunViewSchema', () => {
  it('accepts the bounded metadata-only run view', () => {
    expect(WorkflowRunViewSchema.parse(runView)).toMatchObject({
      id: runView.id,
      status: 'queued',
    });
  });

  it('rejects unexpected response fields and invalid identifiers', () => {
    expect(
      WorkflowRunViewSchema.safeParse({
        ...runView,
        deviceId: 'not-a-uuid',
        deviceToken: 'must-never-enter-the-client-view',
      }).success,
    ).toBe(false);
  });
});
