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
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  vi.restoreAllMocks();
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

  it('rejects a later visible Drive execution until the timed-out driver actually settles', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-visible-drive-timeout-'));
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
    const reporterAbortController = new AbortController();
    const reporter: AgentJobReporter = {
      ...createReporter([]),
      signal: reporterAbortController.signal,
    };
    let activeDownloads = 0;
    let maximumActiveDownloads = 0;
    let downloadCallCount = 0;
    let markFirstDownloadStarted: (() => void) | undefined;
    const firstDownloadStarted = new Promise<void>((resolve) => {
      markFirstDownloadStarted = resolve;
    });
    let markFirstDownloadAborted: (() => void) | undefined;
    const firstDownloadAborted = new Promise<void>((resolve) => {
      markFirstDownloadAborted = resolve;
    });
    let allowFirstDownloadSettlement: (() => void) | undefined;
    const firstDownloadSettlementAllowed = new Promise<void>((resolve) => {
      allowFirstDownloadSettlement = resolve;
    });
    let markFirstDownloadSettled: (() => void) | undefined;
    const firstDownloadSettled = new Promise<void>((resolve) => {
      markFirstDownloadSettled = resolve;
    });
    let observeControllerSlotRelease = false;
    let markControllerSlotReleased: (() => void) | undefined;
    const controllerSlotReleased = new Promise<void>((resolve) => {
      markControllerSlotReleased = resolve;
    });
    const receivedSignals: AbortSignal[] = [];
    const computerUse = new DesktopComputerUseController({
      audit: () => undefined,
      driveDriver: {
        async download(_input, signal) {
          downloadCallCount += 1;
          const downloadNumber = downloadCallCount;
          activeDownloads += 1;
          maximumActiveDownloads = Math.max(maximumActiveDownloads, activeDownloads);
          receivedSignals.push(signal);
          try {
            if (downloadNumber === 1) {
              markFirstDownloadStarted?.();
              await new Promise<void>((resolve) => {
                const resolveForAbort = () => {
                  markFirstDownloadAborted?.();
                  resolve();
                };
                if (signal.aborted) {
                  resolveForAbort();
                  return;
                }
                signal.addEventListener('abort', resolveForAbort, { once: true });
              });
              await firstDownloadSettlementAllowed;
              throw new Error('Visible Drive context settled after abort.');
            }
            return { inputHashes: [], paths: [] };
          } finally {
            activeDownloads -= 1;
            if (downloadNumber === 1) markFirstDownloadSettled?.();
          }
        },
      },
      driver: {
        async perform(input) {
          return { activeWorkbookName: input.workbookPath.split('/').at(-1) ?? '' };
        },
      },
      onSnapshot: () => {
        if (
          observeControllerSlotRelease &&
          activeDownloads === 0 &&
          !computerUse.getSnapshot().takeoverAvailable
        ) {
          markControllerSlotReleased?.();
        }
      },
      openPath: async () => '',
      permission: { check: () => 'granted' },
      platform: 'darwin',
    });
    computerUse.setEnabled(true);
    const executor = new DesktopWorkflowJobExecutor(spreadsheet, computerUse);
    const job: AgentJob = {
      attempt: 1,
      availableAt: '2026-08-02T03:00:00.000Z',
      deviceId: DEVICE_ID,
      id: '10000000-0000-4000-8000-000000005043',
      idempotencyKey: 'visible-drive-timeout-1',
      maxAttempts: 3,
      status: 'claimed',
      tenantId: TENANT_ID,
      workflow: {
        description: 'Abort a timed-out visible Drive download.',
        edges: [],
        executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
        name: 'Visible Drive timeout',
        nodes: [
          {
            config: {
              browser: 'chrome',
              downloadTimeoutSeconds: 600,
              folderAliasId: grant.folderAliasId,
              folderId: '1DriveFolderVisibleTimeout123',
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
      workflowRunId: '10000000-0000-4000-8000-000000005044',
    };

    vi.useFakeTimers();
    try {
      const firstExecution = executor.execute(job, reporter).then(
        () => undefined,
        (error: unknown) => error,
      );
      await firstDownloadStarted;
      observeControllerSlotRelease = true;
      expect(activeDownloads).toBe(1);

      await vi.advanceTimersByTimeAsync(600_000);
      const firstError = await firstExecution;
      await firstDownloadAborted;

      expect(firstError).toMatchObject({ code: 'NODE_EXECUTION_TIMEOUT' });
      expect(receivedSignals[0]?.aborted).toBe(true);
      expect(activeDownloads).toBe(1);

      await expect(
        executor.execute(
          {
            ...job,
            id: '10000000-0000-4000-8000-000000005045',
            idempotencyKey: 'visible-drive-timeout-2',
            workflowRunId: '10000000-0000-4000-8000-000000005046',
          },
          reporter,
        ),
      ).rejects.toMatchObject({ code: 'COMPUTER_USE_OPERATION_IN_PROGRESS' });
      expect(downloadCallCount).toBe(1);
      expect(activeDownloads).toBe(1);
      expect(maximumActiveDownloads).toBe(1);

      allowFirstDownloadSettlement?.();
      await firstDownloadSettled;
      await controllerSlotReleased;

      await expect(
        executor.execute(
          {
            ...job,
            id: '10000000-0000-4000-8000-000000005047',
            idempotencyKey: 'visible-drive-timeout-3',
            workflowRunId: '10000000-0000-4000-8000-000000005048',
          },
          reporter,
        ),
      ).resolves.toMatchObject({ status: 'succeeded', stepCount: 1 });
      expect(downloadCallCount).toBe(2);
      expect(maximumActiveDownloads).toBe(1);
    } finally {
      allowFirstDownloadSettlement?.();
      reporterAbortController.abort();
      if (downloadCallCount > 0) await firstDownloadSettled;
      vi.useRealTimers();
    }
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
    const cloudInputs: JsonValue[] = [];
    const reporter: AgentJobReporter = {
      async downloadDriveExcelFile(_nodeId, file) {
        const bytes = sourceBytes.get(file.fileId);
        if (bytes === undefined) throw new Error('Unexpected Drive workbook request.');
        return bytes;
      },
      async executeCloudStep(_nodeId, input) {
        cloudInputs.push(structuredClone(input));
        return {
          duplicate: false,
          output: {
            kind: 'ai_summary',
            model: 'test-model',
            provider: 'mock',
            text: 'Two local source workbooks were combined.',
          },
          processedFileCount: 0,
          processedRowCount: 0,
        };
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
          { from: 'open', to: 'summarize' },
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
        ],
        schemaVersion: 1,
        trigger: { config: {}, type: 'manual.trigger' },
      },
      workflowRunId: '10000000-0000-4000-8000-000000005033',
    };

    await expect(executor.execute(job, reporter)).resolves.toMatchObject({
      status: 'succeeded',
      stepCount: 6,
    });
    const resultPath = join(directory, 'AI-Excel-本機匯總.xlsx');
    const result = await readSpreadsheet(resultPath, { maxRows: 10, maxSheets: 2 });

    expect(result.sheets[0]?.rows).toEqual([
      { Amount: 120, Item: 'A' },
      { Amount: 300, Item: 'B' },
    ]);
    expect(opened).toEqual([await realpath(resultPath)]);
    expect(cloudInputs).toMatchObject([
      {
        fileCount: 2,
        kind: 'desktop_excel_profile',
        rowCount: 2,
        sheetCount: 1,
      },
    ]);
    expect(JSON.stringify(cloudInputs)).not.toContain('120');
    expect(JSON.stringify(cloudInputs)).not.toContain('300');
    expect(
      steps.find((step) => step.nodeId === 'open' && step.status === 'succeeded')?.output,
    ).toEqual(cloudInputs[0]);
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'download', status: 'succeeded' }),
        expect.objectContaining({
          nodeId: 'open',
          output: expect.objectContaining({ fileCount: 2, kind: 'desktop_excel_profile' }),
          status: 'succeeded',
        }),
      ]),
    );
  });

  it('relays only a bounded spreadsheet profile into approved cloud report steps', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-hybrid-report-job-'));
    temporaryDirectories.push(directory);
    await Promise.all([
      writeFile(
        join(directory, 'orders-private-a.csv'),
        'ID,Status,Amount,PrivateCode,alice@example.com\n987654321,Paid,120,246813579,customer-1\n987654322,Pending,80,,customer-2\n987654323,Paid,200,,customer-3\n',
        'utf8',
      ),
      writeFile(
        join(directory, 'orders-private-b.csv'),
        'ID,Status,Amount,PrivateCode,alice@example.com\n987654324,Paid,100,,customer-4\n987654325,Pending,50,,customer-5\n',
        'utf8',
      ),
    ]);
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
            config: { folderAliasId: grant.folderAliasId, pattern: 'orders-private-*.csv' },
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
        fileCount: 2,
        kind: 'desktop_excel_profile',
        rowCount: 5,
        sheetCount: 2,
      },
      nodeId: 'summarize',
    });
    expect(JSON.stringify(cloudInputs[0])).not.toContain(directory);
    expect(JSON.stringify(cloudInputs[0])).not.toContain('orders-private-a.csv');
    expect(JSON.stringify(cloudInputs[0])).not.toContain('orders-private-b.csv');
    expect(JSON.stringify(cloudInputs[0])).not.toContain('orders');
    expect(JSON.stringify(cloudInputs[0])).not.toContain('Paid');
    expect(JSON.stringify(cloudInputs[0])).not.toContain('Pending');
    expect(JSON.stringify(cloudInputs[0])).not.toContain('alice@example.com');
    expect(JSON.stringify(cloudInputs[0])).not.toContain('customer-');
    expect(JSON.stringify(cloudInputs[0])).not.toContain('987654321');
    expect(JSON.stringify(cloudInputs[0])).not.toContain('246813579');
    expect(cloudInputs[0]?.input).toMatchObject({
      columns: expect.arrayContaining([
        expect.objectContaining({
          id: 'column_3',
          numeric: expect.objectContaining({
            count: 5,
            statistics: expect.objectContaining({ sum: 550 }),
          }),
          semanticHint: 'amount',
        }),
        expect.objectContaining({
          categorical: {
            sampledDistinctCount: 2,
            topFrequencies: [3, 2],
            unprofiledValueCount: 0,
          },
          id: 'column_2',
          semanticHint: 'status',
        }),
        expect.objectContaining({
          id: 'column_1',
          numeric: { count: 5 },
          semanticHint: 'id',
        }),
        expect.objectContaining({
          id: 'column_4',
          numeric: { count: 1 },
        }),
      ]),
    });
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'write',
          output: expect.objectContaining({
            fileCount: 2,
            kind: 'desktop_excel_profile',
            rowCount: 5,
          }),
          status: 'succeeded',
        }),
      ]),
    );
    expect(
      steps.some((step) => ['summarize', 'compose', 'slides', 'gas'].includes(step.nodeId)),
    ).toBe(false);
  });

  it('does not call the cloud when an AI summary has multiple raw local predecessors', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-cloud-preflight-'));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, 'private.csv'), 'Private\nsecret-value\n', 'utf8');
    const grants = new FolderGrantStore(join(directory, '.agent', 'folder-grants.json'));
    const grant = await grants.authorize(directory, DEVICE_ID, {
      read: true,
      watch: false,
      write: false,
    });
    const spreadsheet = new DesktopSpreadsheetExecutor(
      grants,
      new ProcessingLedger(join(directory, '.agent', 'processing-ledger.json')),
    );
    const executor = new DesktopWorkflowJobExecutor(spreadsheet);
    const steps: StepResult[] = [];
    const executeCloudStep = vi.fn(async () => {
      throw new Error('Cloud execution must not be reached.');
    });
    const reporter: AgentJobReporter = { ...createReporter(steps), executeCloudStep };

    await expect(
      executor.execute(
        {
          attempt: 1,
          availableAt: '2026-08-03T01:00:00.000Z',
          deviceId: DEVICE_ID,
          id: '10000000-0000-4000-8000-000000005065',
          idempotencyKey: 'desktop-cloud-preflight-1',
          maxAttempts: 3,
          status: 'claimed',
          tenantId: TENANT_ID,
          workflow: {
            description: 'Reject ambiguous local predecessors before cloud transfer.',
            edges: [
              { from: 'list_one', to: 'summarize' },
              { from: 'list_two', to: 'summarize' },
            ],
            executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
            name: 'Local cloud preflight',
            nodes: [
              {
                config: { folderAliasId: grant.folderAliasId, pattern: 'private.csv' },
                id: 'list_one',
                type: 'folder.list_files',
                version: 1,
              },
              {
                config: { folderAliasId: grant.folderAliasId, pattern: 'private.csv' },
                id: 'list_two',
                type: 'folder.list_files',
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
            ],
            schemaVersion: 1,
            trigger: { config: {}, type: 'manual.trigger' },
          },
          workflowRunId: '10000000-0000-4000-8000-000000005066',
        },
        reporter,
      ),
    ).rejects.toMatchObject({ code: 'DESKTOP_DATA_VALIDATION_FAILED', retryable: false });

    expect(executeCloudStep).not.toHaveBeenCalled();
    expect(JSON.stringify(steps)).not.toContain('private.csv');
    expect(JSON.stringify(steps)).not.toContain('secret-value');
  });

  it('reports bounded path-free progress while reading a local workbook batch', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-read-progress-'));
    temporaryDirectories.push(directory);
    await Promise.all(
      Array.from({ length: 21 }, async (_, index) => {
        await writeFile(
          join(directory, `batch-${String(index + 1).padStart(2, '0')}.csv`),
          `ID,Private\n${index + 1},customer-${index + 1}\n`,
          'utf8',
        );
      }),
    );
    const grants = new FolderGrantStore(join(directory, '.agent', 'folder-grants.json'));
    const grant = await grants.authorize(directory, DEVICE_ID, {
      read: true,
      watch: false,
      write: false,
    });
    const spreadsheet = new DesktopSpreadsheetExecutor(
      grants,
      new ProcessingLedger(join(directory, '.agent', 'processing-ledger.json')),
    );
    const executor = new DesktopWorkflowJobExecutor(spreadsheet);
    const steps: StepResult[] = [];
    vi.spyOn(Date, 'now').mockReturnValue(0);

    await expect(
      executor.execute(
        {
          attempt: 1,
          availableAt: '2026-08-03T01:00:00.000Z',
          deviceId: DEVICE_ID,
          id: '10000000-0000-4000-8000-000000005061',
          idempotencyKey: 'desktop-read-progress-1',
          maxAttempts: 3,
          status: 'claimed',
          tenantId: TENANT_ID,
          workflow: {
            description: 'Read an approved local workbook batch.',
            edges: [{ from: 'list_files', to: 'read_files' }],
            executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
            name: 'Local workbook progress',
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
                  maxSheets: 30,
                  sheetMode: 'all',
                },
                id: 'read_files',
                type: 'excel.read',
                version: 1,
              },
            ],
            schemaVersion: 1,
            trigger: { config: {}, type: 'manual.trigger' },
          },
          workflowRunId: '10000000-0000-4000-8000-000000005062',
        },
        createReporter(steps),
      ),
    ).resolves.toMatchObject({ processedFileCount: 42, processedRowCount: 21 });

    const runningReadProgress = steps.filter(
      (step) => step.nodeId === 'read_files' && step.status === 'running',
    );
    expect(runningReadProgress).toEqual([
      {
        nodeId: 'read_files',
        processedFileCount: 0,
        processedRowCount: 0,
        status: 'running',
      },
      {
        nodeId: 'read_files',
        progress: { kind: 'workbook_batch', totalWorkbookCount: 21 },
        processedFileCount: 20,
        processedRowCount: 20,
        status: 'running',
      },
      {
        nodeId: 'read_files',
        progress: { kind: 'workbook_batch', totalWorkbookCount: 21 },
        processedFileCount: 21,
        processedRowCount: 21,
        status: 'running',
      },
    ]);
    expect(JSON.stringify(runningReadProgress)).not.toContain(directory);
    expect(JSON.stringify(runningReadProgress)).not.toContain('batch-');
    expect(JSON.stringify(runningReadProgress)).not.toContain('customer-');
    expect(runningReadProgress.every((step) => step.output === undefined)).toBe(true);
  });

  it('fails closed before retaining documents beyond the aggregate row limit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-read-aggregate-limit-'));
    temporaryDirectories.push(directory);
    await Promise.all(
      ['first.csv', 'second.csv'].map(async (fileName) => {
        await writeFile(join(directory, fileName), 'Value\n1\n', 'utf8');
      }),
    );
    const grants = new FolderGrantStore(join(directory, '.agent', 'folder-grants.json'));
    const grant = await grants.authorize(directory, DEVICE_ID, {
      read: true,
      watch: false,
      write: false,
    });
    const spreadsheet = new DesktopSpreadsheetExecutor(
      grants,
      new ProcessingLedger(join(directory, '.agent', 'processing-ledger.json')),
    );
    const sharedRow = Object.freeze({ Value: 1 });
    const rows = new Array<Readonly<Record<string, number>>>(60_000).fill(sharedRow);
    const readSpy = vi.spyOn(spreadsheet, 'read').mockResolvedValue({
      sheets: [{ columns: ['Value'], name: 'Data', rows }],
      source: {
        fileHash: 'a'.repeat(64),
        fileSizeBytes: 1,
        format: 'csv',
        formulaCellCount: 0,
      },
    });
    const executor = new DesktopWorkflowJobExecutor(spreadsheet);
    const steps: StepResult[] = [];
    const reporterAbortController = new AbortController();
    const reporter: AgentJobReporter = {
      ...createReporter(steps),
      signal: reporterAbortController.signal,
    };

    await expect(
      executor.execute(
        {
          attempt: 1,
          availableAt: '2026-08-03T01:00:00.000Z',
          deviceId: DEVICE_ID,
          id: '10000000-0000-4000-8000-000000005063',
          idempotencyKey: 'desktop-read-aggregate-limit-1',
          maxAttempts: 3,
          status: 'claimed',
          tenantId: TENANT_ID,
          workflow: {
            description: 'Reject an oversized local workbook batch.',
            edges: [{ from: 'list_files', to: 'read_files' }],
            executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
            name: 'Local workbook aggregate limit',
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
                  maxRows: 100_000,
                  maxSheets: 200,
                  sheetMode: 'all',
                },
                id: 'read_files',
                type: 'excel.read',
                version: 1,
              },
            ],
            schemaVersion: 1,
            trigger: { config: {}, type: 'manual.trigger' },
          },
          workflowRunId: '10000000-0000-4000-8000-000000005064',
        },
        reporter,
      ),
    ).rejects.toMatchObject({ code: 'FILE_LIMIT_EXCEEDED', retryable: false });

    expect(readSpy).toHaveBeenCalledTimes(2);
    expect(readSpy.mock.calls[0]?.[2]).toMatchObject({ maxRows: 100_000, maxSheets: 200 });
    expect(readSpy.mock.calls[1]?.[2]).toMatchObject({ maxRows: 40_000, maxSheets: 200 });
    const firstReadSignal = readSpy.mock.calls[0]?.[3]?.signal;
    const secondReadSignal = readSpy.mock.calls[1]?.[3]?.signal;
    expect(firstReadSignal).not.toBe(reporter.signal);
    expect(secondReadSignal).not.toBe(reporter.signal);
    reporterAbortController.abort();
    expect(firstReadSignal?.aborted).toBe(true);
    expect(secondReadSignal?.aborted).toBe(true);
    const readSteps = steps.filter((step) => step.nodeId === 'read_files');
    expect(readSteps.at(-1)).toMatchObject({
      error: { code: 'NODE_EXECUTION_FAILED' },
      status: 'failed',
    });
    expect(JSON.stringify(readSteps)).not.toContain(directory);
    expect(JSON.stringify(readSteps)).not.toContain('first.csv');
    expect(JSON.stringify(readSteps)).not.toContain('second.csv');
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
