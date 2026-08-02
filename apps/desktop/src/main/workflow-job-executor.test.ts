import { type AgentJob, type StepResult } from '@ai-workflow-studio/agent-protocol';
import {
  ProcessingLedger,
  hashFile,
  readSpreadsheet,
  writeSpreadsheetAtomic,
} from '@ai-workflow-studio/local-executor';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { FolderGrantStore } from './folder-grants';
import { DesktopComputerUseController } from './computer-use';
import { DesktopSpreadsheetExecutor } from './local-executor';
import { DesktopWorkflowJobExecutor } from './workflow-job-executor';
import type { AgentJobReporter } from './agent-client';

const DEVICE_ID = '10000000-0000-4000-8000-000000000861';
const TENANT_ID = '10000000-0000-4000-8000-000000000862';
const JOB_ID = '10000000-0000-4000-8000-000000000863';
const RUN_ID = '10000000-0000-4000-8000-000000000864';
const temporaryDirectories: string[] = [];

function createReporter(steps: StepResult[]): AgentJobReporter {
  return {
    async downloadDriveExcelFile() {
      throw new Error('This test does not transfer Drive workbooks.');
    },
    async listDriveExcelFiles() {
      throw new Error('This test does not transfer Drive workbooks.');
    },
    async reportStep(step: StepResult) {
      steps.push(structuredClone(step));
    },
    signal: new AbortController().signal,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('DesktopWorkflowJobExecutor', () => {
  it('downloads Drive workbooks into an approved folder, consolidates them, and opens the result', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-drive-desktop-job-'));
    temporaryDirectories.push(directory);
    const firstSource = join(directory, 'source-a.xlsx');
    const secondSource = join(directory, 'source-b.xlsx');
    await writeSpreadsheetAtomic(
      [
        {
          columns: ['Item', 'Amount'],
          name: 'Source A',
          rows: [{ Amount: 120, Item: 'A' }],
        },
      ],
      { outputPath: firstSource, overwrite: false },
    );
    await writeSpreadsheetAtomic(
      [
        {
          columns: ['Item', 'Amount'],
          name: 'Source B',
          rows: [{ Amount: 300, Item: 'B' }],
        },
      ],
      { outputPath: secondSource, overwrite: false },
    );
    const sourceBytes = new Map([
      ['1DriveWorkbookSourceAlpha123', new Uint8Array(await readFile(firstSource))],
      ['1DriveWorkbookSourceBeta1234', new Uint8Array(await readFile(secondSource))],
    ]);
    const grants = new FolderGrantStore(join(directory, '.agent', 'folder-grants.json'));
    const grant = await grants.authorize(directory, DEVICE_ID, {
      read: true,
      watch: false,
      write: true,
    });
    const opened: string[] = [];
    const spreadsheet = new DesktopSpreadsheetExecutor(
      grants,
      new ProcessingLedger(join(directory, '.agent', 'processing-ledger.json')),
    );
    const computerUse = new DesktopComputerUseController({
      audit: () => undefined,
      driver: {
        async perform(input) {
          return { activeWorkbookName: input.workbookPath.split('/').at(-1) ?? '' };
        },
      },
      onSnapshot: () => undefined,
      async openPath(path) {
        opened.push(path);
        return '';
      },
      permission: { check: () => 'granted' },
      platform: 'darwin',
      wait: async () => undefined,
    });
    computerUse.setEnabled(true);
    const executor = new DesktopWorkflowJobExecutor(spreadsheet, computerUse);
    const steps: StepResult[] = [];
    const reporter: AgentJobReporter = {
      async downloadDriveExcelFile(_nodeId, file) {
        const bytes = sourceBytes.get(file.fileId);
        if (bytes === undefined) throw new Error('Unexpected Drive workbook request.');
        return bytes;
      },
      async listDriveExcelFiles() {
        return {
          expiresAt: '2026-08-01T12:00:00.000Z',
          files: [
            {
              downloadToken: 'x'.repeat(40),
              fileId: '1DriveWorkbookSourceAlpha123',
              fileName: 'source-a.xlsx',
              mimeType: 'xlsx',
              size: sourceBytes.get('1DriveWorkbookSourceAlpha123')?.byteLength,
            },
            {
              downloadToken: 'y'.repeat(40),
              fileId: '1DriveWorkbookSourceBeta1234',
              fileName: 'source-b.xlsx',
              mimeType: 'xlsx',
              size: sourceBytes.get('1DriveWorkbookSourceBeta1234')?.byteLength,
            },
          ],
          folderId: '1DriveFolderResource123456789',
        };
      },
      async reportStep(step) {
        steps.push(structuredClone(step));
      },
      signal: new AbortController().signal,
    };
    const job: AgentJob = {
      attempt: 1,
      availableAt: '2026-08-01T10:00:00.000Z',
      deviceId: DEVICE_ID,
      id: '10000000-0000-4000-8000-000000005031',
      idempotencyKey: 'desktop-drive-operation-1',
      maxAttempts: 3,
      status: 'claimed',
      tenantId: TENANT_ID,
      workflow: {
        description: 'Download, merge, save, and open approved workbooks.',
        edges: [
          { from: 'download', to: 'read' },
          { from: 'read', to: 'merge' },
          { from: 'merge', to: 'write' },
          { from: 'write', to: 'open' },
        ],
        executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
        name: 'Drive Desktop Excel operation',
        nodes: [
          {
            config: {
              connectionId: '10000000-0000-4000-8000-000000005032',
              folderAliasId: grant.folderAliasId,
              folderId: '1DriveFolderResource123456789',
              includeSubfolders: true,
              maxFileSizeBytes: 20_000_000,
              maxFiles: 500,
            },
            id: 'download',
            type: 'google_drive.download_excel_folder',
            version: 1,
          },
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
            id: 'read',
            type: 'excel.read',
            version: 1,
          },
          {
            config: { columnMode: 'union', includeSourceFile: true },
            id: 'merge',
            type: 'excel.merge',
            version: 1,
          },
          {
            config: {
              folderAliasId: grant.folderAliasId,
              outputName: 'AI-Excel-本機匯總.xlsx',
              overwrite: false,
              reportTitle: 'AI Excel report',
            },
            id: 'write',
            type: 'excel.create_report',
            version: 1,
          },
          {
            config: {
              actions: ['autofit_used_range', 'save_workbook', 'verify_active_workbook'],
              application: 'excel',
              folderAliasId: grant.folderAliasId,
            },
            id: 'open',
            type: 'excel.visible_review',
            version: 1,
          },
        ],
        schemaVersion: 1,
        trigger: { config: {}, type: 'manual.trigger' },
      },
      workflowRunId: '10000000-0000-4000-8000-000000005033',
    };

    await expect(executor.execute(job, reporter)).resolves.toMatchObject({
      status: 'succeeded',
      stepCount: 5,
    });
    const resultPath = join(directory, 'AI-Excel-本機匯總.xlsx');
    const result = await readSpreadsheet(resultPath, { maxRows: 10, maxSheets: 2 });

    expect(result.sheets[0]?.rows).toEqual([
      { Amount: 120, Item: 'A' },
      { Amount: 300, Item: 'B' },
    ]);
    expect(opened).toEqual([await realpath(resultPath)]);
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'download', status: 'succeeded' }),
        expect.objectContaining({ nodeId: 'open', status: 'succeeded' }),
      ]),
    );
  });

  it('runs a claimed workflow only through a folder grant and suppresses duplicate output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-job-executor-'));
    temporaryDirectories.push(directory);
    const sourcePath = join(directory, 'orders.csv');
    const outputPath = join(directory, 'combined.xlsx');
    await writeFile(
      sourcePath,
      'Order ID,Customer,Amount\nA-1,Acme,10\nA-1,Acme updated,20\nB-2,Beta,15\n',
      'utf8',
    );
    const grants = new FolderGrantStore(join(directory, '.agent', 'folder-grants.json'));
    const grant = await grants.authorize(directory, DEVICE_ID, {
      read: true,
      watch: true,
      write: true,
    });
    const spreadsheet = new DesktopSpreadsheetExecutor(
      grants,
      new ProcessingLedger(join(directory, '.agent', 'processing-ledger.json')),
    );
    const executor = new DesktopWorkflowJobExecutor(spreadsheet);
    const job: AgentJob = {
      attempt: 1,
      availableAt: '2026-07-26T06:00:00.000Z',
      deviceId: DEVICE_ID,
      id: JOB_ID,
      idempotencyKey: 'desktop-workflow-job-1',
      maxAttempts: 3,
      status: 'claimed',
      tenantId: TENANT_ID,
      workflow: {
        description: 'Combine authorized order files.',
        edges: [
          { from: 'list_files', to: 'read_files' },
          { from: 'read_files', to: 'deduplicate' },
          { from: 'deduplicate', to: 'write_report' },
        ],
        executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
        name: 'Order report',
        nodes: [
          {
            config: { folderAliasId: grant.folderAliasId, pattern: '*.csv' },
            id: 'list_files',
            type: 'folder.list_files',
            version: 1,
          },
          {
            config: {
              headerMode: 'auto',
              headerRow: 1,
              headerScanRows: 30,
              maxFileSizeBytes: 1_000_000,
              maxRows: 1_000,
              maxSheets: 10,
              sheetMode: 'all',
            },
            id: 'read_files',
            type: 'excel.read',
            version: 1,
          },
          {
            config: { keep: 'first', keys: ['Order ID'] },
            id: 'deduplicate',
            type: 'data.deduplicate',
            version: 1,
          },
          {
            config: {
              folderAliasId: grant.folderAliasId,
              outputName: 'combined.xlsx',
              overwrite: false,
              reportTitle: 'Combined orders',
            },
            id: 'write_report',
            type: 'excel.create_report',
            version: 1,
          },
        ],
        schemaVersion: 1,
        trigger: { config: {}, type: 'manual.trigger' },
      },
      workflowRunId: RUN_ID,
    };
    const sourceHash = await hashFile(sourcePath);
    const steps: StepResult[] = [];
    const reporter = createReporter(steps);

    await expect(executor.execute(job, reporter)).resolves.toMatchObject({
      status: 'succeeded',
      stepCount: 4,
    });
    const outputHash = await hashFile(outputPath);
    await expect(executor.execute(job, reporter)).resolves.toMatchObject({
      status: 'succeeded',
      stepCount: 4,
    });

    expect(await hashFile(sourcePath)).toBe(sourceHash);
    expect(await hashFile(outputPath)).toBe(outputHash);
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'deduplicate',
          processedRowCount: 2,
          status: 'succeeded',
        }),
        expect.objectContaining({
          nodeId: 'write_report',
          processedRowCount: 2,
          status: 'succeeded',
        }),
      ]),
    );
  });

  it('reads, deduplicates, aggregates, and writes an authorized xlsx workbook', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-xlsx-job-executor-'));
    temporaryDirectories.push(directory);
    const sourcePath = join(directory, 'orders.xlsx');
    const outputPath = join(directory, 'phase47-summary.xlsx');
    await writeSpreadsheetAtomic(
      [
        {
          columns: ['Order ID', 'Date', 'Customer', 'Status', 'Amount'],
          name: 'Orders',
          rows: [
            {
              Amount: 120,
              Customer: 'Acme',
              Date: '2026-08-01',
              'Order ID': 'ORD-001',
              Status: 'Paid',
            },
            {
              Amount: 80,
              Customer: 'Beta',
              Date: '2026-08-01',
              'Order ID': 'ORD-002',
              Status: 'Pending',
            },
            {
              Amount: 80,
              Customer: 'Beta duplicate',
              Date: '2026-08-01',
              'Order ID': 'ORD-002',
              Status: 'Pending',
            },
            {
              Amount: 200,
              Customer: 'Gamma',
              Date: '2026-08-01',
              'Order ID': 'ORD-003',
              Status: 'Paid',
            },
            {
              Amount: 50,
              Customer: 'Delta',
              Date: '2026-08-01',
              'Order ID': 'ORD-004',
              Status: 'Cancelled',
            },
            {
              Amount: 25,
              Customer: 'Echo',
              Date: '2026-08-01',
              'Order ID': 'ORD-005',
              Status: 'Pending',
            },
          ],
        },
      ],
      { outputPath: sourcePath, overwrite: false },
    );

    const grants = new FolderGrantStore(join(directory, '.agent', 'folder-grants.json'));
    const grant = await grants.authorize(directory, DEVICE_ID, {
      read: true,
      watch: true,
      write: true,
    });
    const spreadsheet = new DesktopSpreadsheetExecutor(
      grants,
      new ProcessingLedger(join(directory, '.agent', 'processing-ledger.json')),
    );
    const executor = new DesktopWorkflowJobExecutor(spreadsheet);
    const job: AgentJob = {
      attempt: 1,
      availableAt: '2026-08-01T06:00:00.000Z',
      deviceId: DEVICE_ID,
      id: '10000000-0000-4000-8000-000000000865',
      idempotencyKey: 'desktop-xlsx-workflow-job-1',
      maxAttempts: 3,
      status: 'claimed',
      tenantId: TENANT_ID,
      workflow: {
        description: 'Summarize an authorized order workbook.',
        edges: [
          { from: 'list_workbooks', to: 'read_workbooks' },
          { from: 'read_workbooks', to: 'deduplicate_rows' },
          { from: 'deduplicate_rows', to: 'aggregate_rows' },
          { from: 'aggregate_rows', to: 'create_excel_report' },
        ],
        executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
        name: 'Local Excel summary',
        nodes: [
          {
            config: { folderAliasId: grant.folderAliasId, pattern: 'orders.xlsx' },
            id: 'list_workbooks',
            type: 'folder.list_files',
            version: 1,
          },
          {
            config: {
              headerMode: 'auto',
              headerRow: 1,
              headerScanRows: 30,
              maxFileSizeBytes: 50_000_000,
              maxRows: 100_000,
              maxSheets: 50,
              sheetMode: 'all',
            },
            id: 'read_workbooks',
            type: 'excel.read',
            version: 1,
          },
          {
            config: { keep: 'first', keys: ['Order ID'] },
            id: 'deduplicate_rows',
            type: 'data.deduplicate',
            version: 1,
          },
          {
            config: {
              groupBy: ['Status'],
              operations: [{ alias: 'Amount Total', field: 'Amount', operation: 'sum' }],
            },
            id: 'aggregate_rows',
            type: 'data.aggregate',
            version: 1,
          },
          {
            config: {
              folderAliasId: grant.folderAliasId,
              outputName: 'phase47-summary.xlsx',
              overwrite: false,
              reportTitle: 'AI Excel summary report',
            },
            id: 'create_excel_report',
            type: 'excel.create_report',
            version: 1,
          },
        ],
        schemaVersion: 1,
        trigger: { config: {}, type: 'manual.trigger' },
      },
      workflowRunId: '10000000-0000-4000-8000-000000000866',
    };
    const steps: StepResult[] = [];
    const reporter = createReporter(steps);

    await expect(executor.execute(job, reporter)).resolves.toMatchObject({
      processedFileCount: 5,
      processedRowCount: 17,
      status: 'succeeded',
      stepCount: 5,
    });
    const report = await readSpreadsheet(outputPath, { maxRows: 10, maxSheets: 2 });

    expect(report.sheets[0]?.rows).toEqual([
      { 'Amount Total': 320, Status: 'Paid' },
      { 'Amount Total': 105, Status: 'Pending' },
      { 'Amount Total': 50, Status: 'Cancelled' },
    ]);
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'read_workbooks',
          processedRowCount: 6,
          status: 'succeeded',
        }),
        expect.objectContaining({
          nodeId: 'aggregate_rows',
          processedRowCount: 3,
          status: 'succeeded',
        }),
        expect.objectContaining({
          nodeId: 'create_excel_report',
          processedRowCount: 3,
          status: 'succeeded',
        }),
      ]),
    );
  });
});
