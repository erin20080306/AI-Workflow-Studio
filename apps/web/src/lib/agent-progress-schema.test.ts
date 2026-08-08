import { AgentJobSchema } from '@ai-workflow-studio/agent-protocol';
import { describe, expect, it } from 'vitest';

import { validateAgentProgressRequest } from './agent-progress-schema';

const DEVICE_ID = '10000000-0000-4000-8000-000000000001';
const JOB_ID = '10000000-0000-4000-8000-000000000002';
const RUN_ID = '10000000-0000-4000-8000-000000000003';
const TENANT_ID = '10000000-0000-4000-8000-000000000004';
const FOLDER_ID = '10000000-0000-4000-8000-000000000005';

const job = AgentJobSchema.parse({
  availableAt: '2026-08-03T00:00:00.000Z',
  deviceId: DEVICE_ID,
  id: JOB_ID,
  idempotencyKey: 'visible-progress-test',
  status: 'running',
  tenantId: TENANT_ID,
  workflow: {
    description: 'Visible local review followed by a cloud summary.',
    edges: [
      { from: 'download_workbooks', to: 'read_workbooks' },
      { from: 'read_workbooks', to: 'review_workbook' },
      { from: 'review_workbook', to: 'summarize_workbook' },
    ],
    executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
    name: 'Visible progress boundary',
    nodes: [
      {
        config: {
          headerMode: 'auto',
          headerRow: 1,
          headerScanRows: 30,
          maxFileSizeBytes: 20_000_000,
          maxRows: 100_000,
          maxSheets: 200,
          sheetMode: 'all',
        },
        id: 'read_workbooks',
        type: 'excel.read',
        version: 1,
      },
      {
        config: {
          browser: 'chrome',
          downloadTimeoutSeconds: 600,
          folderAliasId: FOLDER_ID,
          folderId: '1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ',
          maxFileSizeBytes: 50_000_000,
          maxFiles: 500,
        },
        id: 'download_workbooks',
        type: 'google_drive.visible_download_folder',
        version: 1,
      },
      {
        config: {
          actions: ['save_workbook', 'verify_active_workbook'],
          application: 'excel',
          folderAliasId: FOLDER_ID,
        },
        id: 'review_workbook',
        type: 'excel.visible_review',
        version: 1,
      },
      {
        config: {
          includeCaseStudy: false,
          includeRecommendations: true,
          language: 'zh-Hant',
          maxCharacters: 6_000,
          provider: 'auto',
          style: 'professional',
          tier: 'auto',
        },
        id: 'summarize_workbook',
        type: 'ai.summarize',
        version: 1,
      },
    ],
    schemaVersion: 1,
    trigger: { config: {}, type: 'manual.trigger' },
  },
  workflowRunId: RUN_ID,
});

const safeProfile = {
  columns: [],
  fileCount: 2,
  kind: 'desktop_excel_profile',
  rowCount: 10,
  sheetCount: 1,
  truncatedColumns: 0,
};

function progress(nodeId: string, status: 'running' | 'succeeded', output?: unknown) {
  return {
    eventId: '10000000-0000-4000-8000-000000000006',
    step: {
      nodeId,
      ...(output === undefined ? {} : { output }),
      processedFileCount: 0,
      processedRowCount: 0,
      status,
    },
  };
}

describe('validateAgentProgressRequest', () => {
  it('rejects progress that would move a workflow step back to pending', () => {
    expect(() =>
      validateAgentProgressRequest(job, {
        eventId: '10000000-0000-4000-8000-000000000006',
        step: {
          nodeId: 'read_workbooks',
          processedFileCount: 0,
          processedRowCount: 0,
          status: 'pending',
        },
      }),
    ).toThrow();
  });

  it('accepts only the strict statistical profile from the local AI-summary predecessor', () => {
    expect(
      validateAgentProgressRequest(job, progress('review_workbook', 'succeeded', safeProfile)),
    ).toMatchObject({ step: { output: safeProfile, status: 'succeeded' } });

    expect(() =>
      validateAgentProgressRequest(
        job,
        progress('review_workbook', 'succeeded', {
          ...safeProfile,
          localPath: '/Users/customer/Downloads/private.xlsx',
          rows: [{ customer: 'private value' }],
        }),
      ),
    ).toThrow();
  });

  it('rejects generic cloud progress so it cannot forge cloud state or event output', () => {
    expect(() =>
      validateAgentProgressRequest(
        job,
        progress('summarize_workbook', 'succeeded', {
          kind: 'ai_summary',
          text: 'synthetic result',
        }),
      ),
    ).toThrow();
  });

  it('rejects output on unrelated local nodes and mismatched visible actions', () => {
    expect(() =>
      validateAgentProgressRequest(job, progress('download_workbooks', 'succeeded', safeProfile)),
    ).toThrow();
    expect(() =>
      validateAgentProgressRequest(
        job,
        progress('download_workbooks', 'running', {
          computerUseAction: 'excel.save_workbook',
        }),
      ),
    ).toThrow();
  });

  it('accepts only the matching bounded visible action while a local step is running', () => {
    expect(
      validateAgentProgressRequest(
        job,
        progress('download_workbooks', 'running', {
          computerUseAction: 'drive.verify_download',
        }),
      ),
    ).toMatchObject({
      step: { output: { computerUseAction: 'drive.verify_download' }, status: 'running' },
    });
  });

  it('accepts only count-based workbook progress on a running local Excel read', () => {
    expect(
      validateAgentProgressRequest(job, {
        ...progress('read_workbooks', 'running'),
        step: {
          ...progress('read_workbooks', 'running').step,
          processedFileCount: 40,
          processedRowCount: 2_400,
          progress: { kind: 'workbook_batch', totalWorkbookCount: 481 },
        },
      }),
    ).toMatchObject({
      step: {
        processedFileCount: 40,
        progress: { kind: 'workbook_batch', totalWorkbookCount: 481 },
      },
    });

    expect(() =>
      validateAgentProgressRequest(job, {
        ...progress('read_workbooks', 'running'),
        step: {
          ...progress('read_workbooks', 'running').step,
          processedFileCount: 482,
          progress: { kind: 'workbook_batch', totalWorkbookCount: 481 },
        },
      }),
    ).toThrow();
    expect(() =>
      validateAgentProgressRequest(job, {
        ...progress('read_workbooks', 'running'),
        step: {
          ...progress('read_workbooks', 'running').step,
          progress: {
            fileNames: ['private-ledger.xls'],
            kind: 'workbook_batch',
            totalWorkbookCount: 481,
          },
        },
      }),
    ).toThrow();
  });
});
