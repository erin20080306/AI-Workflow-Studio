import { type AgentJob, type StepResult } from '@ai-workflow-studio/agent-protocol';
import {
  ProcessingLedger,
  hashFile,
  readSpreadsheet,
  writeSpreadsheetAtomic,
} from '@ai-workflow-studio/local-executor';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { FolderGrantStore } from './folder-grants';
import { DesktopSpreadsheetExecutor } from './local-executor';
import { DesktopWorkflowJobExecutor } from './workflow-job-executor';

const DEVICE_ID = '10000000-0000-4000-8000-000000000861';
const TENANT_ID = '10000000-0000-4000-8000-000000000862';
const JOB_ID = '10000000-0000-4000-8000-000000000863';
const RUN_ID = '10000000-0000-4000-8000-000000000864';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('DesktopWorkflowJobExecutor', () => {
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
    const controller = new AbortController();
    const reporter = {
      async reportStep(step: StepResult) {
        steps.push(structuredClone(step));
      },
      signal: controller.signal,
    };

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
    const reporter = {
      async reportStep(step: StepResult) {
        steps.push(structuredClone(step));
      },
      signal: new AbortController().signal,
    };

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
