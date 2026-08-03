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

  it('accepts only an allowlisted visible Computer Use action on a running step', () => {
    const parsed = WorkflowRunViewSchema.parse({
      ...runView,
      steps: [
        {
          attempt: 1,
          currentAction: 'excel.verify_active_workbook',
          nodeId: 'visible_review',
          nodeType: 'excel.visible_review',
          processedFileCount: 0,
          processedRowCount: 0,
          status: 'running',
        },
      ],
    });

    expect(parsed.steps[0]?.currentAction).toBe('excel.verify_active_workbook');
    expect(
      WorkflowRunViewSchema.parse({
        ...runView,
        steps: [
          {
            attempt: 1,
            currentAction: 'drive.verify_download',
            nodeId: 'visible_download',
            nodeType: 'google_drive.visible_download_folder',
            processedFileCount: 0,
            processedRowCount: 0,
            status: 'running',
          },
        ],
      }).steps[0]?.currentAction,
    ).toBe('drive.verify_download');
    expect(
      WorkflowRunViewSchema.safeParse({
        ...runView,
        steps: [
          {
            attempt: 1,
            currentAction: 'shell.execute_anything',
            nodeId: 'visible_review',
            nodeType: 'excel.visible_review',
            processedFileCount: 0,
            processedRowCount: 0,
            status: 'running',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('exposes bounded Drive workbook progress without accepting private checkpoint data', () => {
    const parsed = WorkflowRunViewSchema.parse({
      ...runView,
      steps: [
        {
          attempt: 1,
          driveWorkbookProgress: { phase: 'batching', totalWorkbookCount: 120 },
          nodeId: 'read_drive_excel',
          nodeType: 'google_drive.read_excel_folder',
          processedFileCount: 40,
          processedRowCount: 2_400,
          status: 'running',
        },
      ],
    });

    expect(parsed.steps[0]?.driveWorkbookProgress).toEqual({
      phase: 'batching',
      totalWorkbookCount: 120,
    });
    expect(
      WorkflowRunViewSchema.safeParse({
        ...runView,
        steps: [
          {
            attempt: 1,
            driveWorkbookProgress: {
              fileNames: ['private-ledger.xlsx'],
              phase: 'batching',
              totalWorkbookCount: 120,
            },
            nodeId: 'read_drive_excel',
            nodeType: 'google_drive.read_excel_folder',
            processedFileCount: 0,
            processedRowCount: 0,
            status: 'running',
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      WorkflowRunViewSchema.safeParse({
        ...runView,
        steps: [
          {
            attempt: 1,
            driveWorkbookProgress: { phase: 'batching', totalWorkbookCount: 1_001 },
            nodeId: 'read_drive_excel',
            nodeType: 'google_drive.read_excel_folder',
            processedFileCount: 0,
            processedRowCount: 0,
            status: 'running',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts strict count-only local workbook progress and rejects private fields', () => {
    expect(
      WorkflowRunViewSchema.safeParse({
        ...runView,
        steps: [
          {
            attempt: 1,
            nodeId: 'read_local_workbooks',
            nodeType: 'excel.read',
            processedFileCount: 40,
            processedRowCount: 2_400,
            progress: { kind: 'workbook_batch', totalWorkbookCount: 481 },
            status: 'running',
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      WorkflowRunViewSchema.safeParse({
        ...runView,
        steps: [
          {
            attempt: 1,
            nodeId: 'read_local_workbooks',
            nodeType: 'excel.read',
            processedFileCount: 40,
            processedRowCount: 2_400,
            progress: {
              fileNames: ['private-ledger.xls'],
              kind: 'workbook_batch',
              totalWorkbookCount: 481,
            },
            status: 'running',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('exposes only validated report artifacts and trusted Google Slides links', () => {
    const parsed = WorkflowRunViewSchema.parse({
      ...runView,
      steps: [
        {
          attempt: 1,
          nodeId: 'create_slides',
          nodeType: 'google_slides.create',
          processedFileCount: 1,
          processedRowCount: 0,
          result: {
            kind: 'google_slides_presentation',
            presentationId: 'presentation_12345678',
            slideCount: 8,
            url: 'https://docs.google.com/presentation/d/presentation_12345678/edit',
          },
          status: 'succeeded',
        },
      ],
    });

    expect(parsed.steps[0]?.result).toMatchObject({ kind: 'google_slides_presentation' });
    expect(
      WorkflowRunViewSchema.safeParse({
        ...runView,
        steps: [
          {
            attempt: 1,
            nodeId: 'create_slides',
            nodeType: 'google_slides.create',
            processedFileCount: 1,
            processedRowCount: 0,
            result: {
              kind: 'google_slides_presentation',
              presentationId: 'presentation_12345678',
              slideCount: 8,
              url: 'https://attacker.invalid/presentation_12345678',
            },
            status: 'succeeded',
          },
        ],
      }).success,
    ).toBe(false);
  });
});
