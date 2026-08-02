import { type AgentJob, type JsonValue, type StepResult } from '@ai-workflow-studio/agent-protocol';
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
    async executeCloudStep() {
      throw new Error('This test does not continue into a cloud step.');
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
  it('dispatches an approved visible Drive download through the Computer Use driver', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-visible-drive-job-'));
    temporaryDirectories.push(directory);
    const grants = new FolderGrantStore(join(directory, '.agent', 'folder-grants.json'));
    const grant = await grants.authorize(directory, DEVICE_ID, {
      read: true,
      watch: false,
      write: true,
    });
    const spreadsheet = new DesktopSpreadsheetExecutor(
      grants,
      new ProcessingLedger(join(directory, '.agent', 'processing-ledger.json')),
    );
    const computerUse = new DesktopComputerUseController({
      audit: () => undefined,
      driveDriver: {
        async download(input, _signal, onAction) {
          await onAction('drive.open_folder');
          await onAction('drive.select_items');
          await onAction('drive.download_items');
          const outputName = 'visible-source.xlsx';
          const outputPath = join(input.workDirectory, outputName);
          await writeSpreadsheetAtomic(
            [{ columns: ['Item'], name: 'Visible', rows: [{ Item: 'Downloaded' }] }],
            { outputPath, overwrite: false },
          );
          await onAction('drive.verify_download');
          return {
            inputHashes: [await hashFile(outputPath)],
            paths: [`${input.workRelativePath}/${outputName}`],
          };
        },
      },
      driver: {
        async perform(input) {
          return { activeWorkbookName: input.workbookPath.split('/').at(-1) ?? '' };
        },
      },
      onSnapshot: () => undefined,
      openPath: async () => '',
      permission: { check: () => 'granted' },
      platform: 'darwin',
    });
    computerUse.setEnabled(true);
    const executor = new DesktopWorkflowJobExecutor(spreadsheet, computerUse);
    const steps: StepResult[] = [];
    const job: AgentJob = {
      attempt: 1,
      availableAt: '2026-08-02T03:00:00.000Z',
      deviceId: DEVICE_ID,
      id: '10000000-0000-4000-8000-000000005041',
      idempotencyKey: 'visible-drive-operation-1',
      maxAttempts: 3,
      status: 'claimed',
      tenantId: TENANT_ID,
      workflow: {
        description: 'Visibly download the approved Drive folder.',
        edges: [],
        executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
        name: 'Visible Drive download',
        nodes: [
          {
            config: {
              browser: 'chrome',
              downloadTimeoutSeconds: 300,
              folderAliasId: grant.folderAliasId,
              folderId: '1DriveFolderVisibleDownload123',
              maxFileSizeBytes: 50_000_000,
              maxFiles: 500,
            },
            id: 'visible_download',
            type: 'google_drive.visible_download_folder',
            version: 1,
          },
        ],
        schemaVersion: 1,
        trigger: { config: {}, type: 'manual.trigger' },
      },
      workflowRunId: '10000000-0000-4000-8000-000000005042',
    };

    await expect(executor.execute(job, createReporter(steps))).resolves.toMatchObject({
      status: 'succeeded',
      stepCount: 1,
    });
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'visible_download',
          output: { computerUseAction: 'drive.download_items' },
          status: 'running',
        }),
        expect.objectContaining({ nodeId: 'visible_download', status: 'succeeded' }),
      ]),
    );
  });

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
      async executeCloudStep() {
        throw new Error('This test does not continue into a cloud step.');
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

  it('relays only a bounded spreadsheet profile into approved cloud report steps', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-hybrid-report-job-'));
    temporaryDirectories.push(directory);
    await writeFile(
      join(directory, 'orders.csv'),
      'Status,Amount\nPaid,120\nPending,80\nPaid,200\n',
      'utf8',
    );
    const grants = new FolderGrantStore(join(directory, '.agent', 'folder-grants.json'));
    const grant = await grants.authorize(directory, DEVICE_ID, {
      read: true,
      watch: false,
      write: true,
    });
    const spreadsheet = new DesktopSpreadsheetExecutor(
      grants,
      new ProcessingLedger(join(directory, '.agent', 'processing-ledger.json')),
    );
    const executor = new DesktopWorkflowJobExecutor(spreadsheet);
    const cloudInputs: { readonly input: JsonValue; readonly nodeId: string }[] = [];
    const steps: StepResult[] = [];
    const reporter: AgentJobReporter = {
      async downloadDriveExcelFile() {
        throw new Error('This test does not transfer Drive workbooks.');
      },
      async executeCloudStep(nodeId, input) {
        cloudInputs.push({ input: structuredClone(input), nodeId });
        if (nodeId === 'summarize') {
          return {
            duplicate: false,
            output: {
              kind: 'ai_summary',
              model: 'test-model',
              provider: 'mock',
              text: 'Paid orders lead the sample.',
            },
            processedFileCount: 0,
            processedRowCount: 0,
          };
        }
        if (nodeId === 'compose') {
          return {
            duplicate: false,
            output: {
              content: '# Report\n\nPaid orders lead the sample.',
              format: 'markdown',
              includeReferences: true,
              kind: 'business_report',
              title: 'AI report',
            },
            processedFileCount: 0,
            processedRowCount: 0,
          };
        }
        if (nodeId === 'slides') {
          return {
            duplicate: false,
            output: {
              kind: 'google_slides_presentation',
              presentationId: 'presentation_12345678',
              slideCount: 8,
              url: 'https://docs.google.com/presentation/d/presentation_12345678/edit',
            },
            processedFileCount: 1,
            processedRowCount: 0,
          };
        }
        return {
          duplicate: false,
          output: {
            deploymentId: 'deployment_12345678',
            kind: 'apps_script_deployment',
            scriptId: 'script_12345678',
          },
          processedFileCount: 1,
          processedRowCount: 0,
        };
      },
      async listDriveExcelFiles() {
        throw new Error('This test does not transfer Drive workbooks.');
      },
      async reportStep(step) {
        steps.push(structuredClone(step));
      },
      signal: new AbortController().signal,
    };
    const connectionId = '10000000-0000-4000-8000-000000005052';
    const job: AgentJob = {
      attempt: 1,
      availableAt: '2026-08-02T06:00:00.000Z',
      deviceId: DEVICE_ID,
      id: '10000000-0000-4000-8000-000000005051',
      idempotencyKey: 'desktop-cloud-report-1',
      maxAttempts: 3,
      status: 'claimed',
      tenantId: TENANT_ID,
      workflow: {
        description: 'Create local Excel and approved cloud report artifacts.',
        edges: [
          { from: 'list', to: 'read' },
          { from: 'read', to: 'write' },
          { from: 'write', to: 'summarize' },
          { from: 'summarize', to: 'compose' },
          { from: 'compose', to: 'slides' },
          { from: 'slides', to: 'gas' },
        ],
        executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
        name: 'Hybrid Excel report',
        nodes: [
          {
            config: { folderAliasId: grant.folderAliasId, pattern: 'orders.csv' },
            id: 'list',
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
            id: 'read',
            type: 'excel.read',
            version: 1,
          },
          {
            config: {
              folderAliasId: grant.folderAliasId,
              outputName: 'AI-Excel-report.xlsx',
              overwrite: false,
              reportTitle: 'AI Excel report',
            },
            id: 'write',
            type: 'excel.create_report',
            version: 1,
          },
          {
            config: {
              includeCaseStudy: false,
              includeRecommendations: true,
              language: 'zh-Hant',
              maxCharacters: 6_000,
              provider: 'mock',
              style: 'professional',
              tier: 'auto',
            },
            id: 'summarize',
            type: 'ai.summarize',
            version: 1,
          },
          {
            config: { format: 'markdown', includeReferences: true, title: 'AI report' },
            id: 'compose',
            type: 'report.compose',
            version: 1,
          },
          {
            config: {
              connectionId,
              includeImages: true,
              includeReferences: true,
              maxSlides: 8,
              title: 'AI presentation',
            },
            id: 'slides',
            type: 'google_slides.create',
            version: 1,
          },
          {
            config: {
              connectionId,
              deployment: 'api_executable',
              template: 'slides-executive-report',
              title: 'Approved report automation',
            },
            id: 'gas',
            type: 'apps_script.deploy_template',
            version: 1,
          },
        ],
        schemaVersion: 1,
        trigger: { config: {}, type: 'manual.trigger' },
      },
      workflowRunId: '10000000-0000-4000-8000-000000005053',
    };

    await expect(executor.execute(job, reporter)).resolves.toMatchObject({
      status: 'succeeded',
      stepCount: 7,
    });
    expect(cloudInputs[0]).toMatchObject({
      input: {
        fileCount: 1,
        kind: 'desktop_excel_profile',
        rowCount: 3,
        sheetCount: 1,
      },
      nodeId: 'summarize',
    });
    expect(JSON.stringify(cloudInputs[0])).not.toContain(directory);
    expect(cloudInputs[0]?.input).toMatchObject({
      columns: expect.arrayContaining([
        expect.objectContaining({ name: 'Amount', numeric: expect.objectContaining({ sum: 400 }) }),
        expect.objectContaining({ name: 'Status' }),
      ]),
    });
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'summarize',
          output: expect.objectContaining({ kind: 'ai_summary' }),
          status: 'succeeded',
        }),
        expect.objectContaining({
          nodeId: 'slides',
          output: expect.objectContaining({ kind: 'google_slides_presentation' }),
          status: 'succeeded',
        }),
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
