import { writeSpreadsheetAtomic } from '@ai-workflow-studio/local-executor';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  ComputerUseError,
  createPlatformExcelDriver,
  DesktopComputerUseController,
  MACOS_EXCEL_SCRIPT,
  type ComputerUseAuditEvent,
  type VisibleExcelDriver,
} from './computer-use';
import {
  MACOS_DRIVE_SAVE_DIALOG_SCRIPT,
  MACOS_VISIBLE_DRIVE_SCRIPT,
  VisibleDriveError,
  type VisibleDriveDriver,
} from './visible-drive';

const WORKBOOK_PATH = '/approved/jobs/report.xlsx';

function setup(options?: {
  readonly driveDriver?: VisibleDriveDriver;
  readonly driver?: VisibleExcelDriver;
  readonly permission?: 'denied' | 'granted' | 'unsupported';
}) {
  const audits: ComputerUseAuditEvent[] = [];
  const snapshots = vi.fn();
  const opened: string[] = [];
  const driver =
    options?.driver ??
    ({
      async perform() {
        return { activeWorkbookName: 'report.xlsx' };
      },
    } satisfies VisibleExcelDriver);
  const controller = new DesktopComputerUseController({
    audit: (event) => audits.push(event),
    ...(options?.driveDriver === undefined ? {} : { driveDriver: options.driveDriver }),
    driver,
    onSnapshot: snapshots,
    async openPath(path) {
      opened.push(path);
      return '';
    },
    permission: {
      check: () => options?.permission ?? 'granted',
    },
    platform: 'darwin',
    wait: async (_milliseconds, signal) => {
      if (signal.aborted) throw new ComputerUseError('COMPUTER_USE_INTERRUPTED');
    },
  });
  return { audits, controller, opened, snapshots };
}

describe('DesktopComputerUseController', () => {
  it('fails closed until the local user opts in', async () => {
    const { controller, opened } = setup();

    await expect(
      controller.operateExcel(
        { actions: ['verify_active_workbook'], workbookPath: WORKBOOK_PATH },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'COMPUTER_USE_DISABLED' });
    expect(opened).toEqual([]);
  });

  it('rejects duplicated actions or an action sequence without final verification', async () => {
    const { controller, opened } = setup();
    controller.setEnabled(true);

    await expect(
      controller.operateExcel(
        {
          actions: ['verify_active_workbook', 'save_workbook'],
          workbookPath: WORKBOOK_PATH,
        },
        new AbortController().signal,
      ),
    ).rejects.toBeDefined();
    await expect(
      controller.operateExcel(
        {
          actions: ['save_workbook', 'save_workbook', 'verify_active_workbook'],
          workbookPath: WORKBOOK_PATH,
        },
        new AbortController().signal,
      ),
    ).rejects.toBeDefined();
    expect(opened).toEqual([]);
  });

  it('refuses visible operation when accessibility permission is denied', async () => {
    const { controller, opened } = setup({ permission: 'denied' });
    controller.setEnabled(true);

    await expect(
      controller.operateExcel(
        { actions: ['verify_active_workbook'], workbookPath: WORKBOOK_PATH },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'COMPUTER_USE_PERMISSION_REQUIRED' });
    expect(controller.getSnapshot().status).toBe('permission_denied');
    expect(opened).toEqual([]);
  });

  it('reports a permission error raised by the visible driver without leaking the workbook path', async () => {
    const driver: VisibleExcelDriver = {
      async perform() {
        throw new ComputerUseError('COMPUTER_USE_PERMISSION_REQUIRED');
      },
    };
    const { audits, controller } = setup({ driver });
    controller.setEnabled(true);

    await expect(
      controller.operateExcel(
        { actions: ['verify_active_workbook'], workbookPath: WORKBOOK_PATH },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'COMPUTER_USE_PERMISSION_REQUIRED' });
    expect(controller.getSnapshot().status).toBe('permission_denied');
    expect(JSON.stringify(audits)).not.toContain(WORKBOOK_PATH);
  });

  it('opens, operates, and verifies an allowlisted workbook without logging its path', async () => {
    const { audits, controller, opened } = setup();
    controller.setEnabled(true);

    await controller.operateExcel(
      {
        actions: ['autofit_used_range', 'save_workbook', 'verify_active_workbook'],
        workbookPath: WORKBOOK_PATH,
      },
      new AbortController().signal,
    );

    expect(opened).toEqual([WORKBOOK_PATH]);
    expect(controller.getSnapshot()).toMatchObject({
      enabled: true,
      lastCompletedAction: 'excel.verify_active_workbook',
      status: 'idle',
      takeoverAvailable: false,
    });
    expect(audits.some((event) => event.code === 'VISIBLE_EXCEL_OPERATION_COMPLETED')).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(WORKBOOK_PATH);
    expect(JSON.stringify(audits)).toMatch(/[a-f0-9]{64}/u);
  });

  it('lets the local user take over and abort an active visible action', async () => {
    let actionStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      actionStarted = resolve;
    });
    const driver: VisibleExcelDriver = {
      async perform(_input, signal) {
        actionStarted?.();
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new ComputerUseError('COMPUTER_USE_INTERRUPTED')),
            { once: true },
          );
        });
        return { activeWorkbookName: 'report.xlsx' };
      },
    };
    const { audits, controller } = setup({ driver });
    controller.setEnabled(true);
    const running = controller.operateExcel(
      { actions: ['verify_active_workbook'], workbookPath: WORKBOOK_PATH },
      new AbortController().signal,
    );
    await started;

    expect(controller.getSnapshot().takeoverAvailable).toBe(true);
    controller.takeOver();

    await expect(running).rejects.toMatchObject({ code: 'COMPUTER_USE_INTERRUPTED' });
    expect(controller.getSnapshot()).toMatchObject({
      status: 'user_takeover',
      takeoverAvailable: false,
    });
    expect(audits.some((event) => event.code === 'COMPUTER_USE_USER_TAKEOVER')).toBe(true);
  });

  it('keeps the visible-operation slot claimed until a taken-over driver actually settles', async () => {
    let actionStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      actionStarted = resolve;
    });
    let allowSettlement: (() => void) | undefined;
    const settlementAllowed = new Promise<void>((resolve) => {
      allowSettlement = resolve;
    });
    let activeOperations = 0;
    let maximumActiveOperations = 0;
    let operationCount = 0;
    const driver: VisibleExcelDriver = {
      async perform(_input, signal) {
        operationCount += 1;
        const operationNumber = operationCount;
        activeOperations += 1;
        maximumActiveOperations = Math.max(maximumActiveOperations, activeOperations);
        try {
          if (operationNumber === 1) {
            actionStarted?.();
            await settlementAllowed;
            if (signal.aborted) throw new ComputerUseError('COMPUTER_USE_INTERRUPTED');
          }
          return { activeWorkbookName: 'report.xlsx' };
        } finally {
          activeOperations -= 1;
        }
      },
    };
    const { controller } = setup({ driver });
    controller.setEnabled(true);
    const firstOperation = controller.operateExcel(
      { actions: ['verify_active_workbook'], workbookPath: WORKBOOK_PATH },
      new AbortController().signal,
    );
    await started;

    controller.takeOver();
    expect(controller.getSnapshot()).toMatchObject({
      status: 'user_takeover',
      takeoverAvailable: false,
    });
    await expect(
      controller.operateExcel(
        { actions: ['verify_active_workbook'], workbookPath: WORKBOOK_PATH },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'COMPUTER_USE_OPERATION_IN_PROGRESS' });
    expect(operationCount).toBe(1);
    expect(activeOperations).toBe(1);

    allowSettlement?.();
    await expect(firstOperation).rejects.toMatchObject({ code: 'COMPUTER_USE_INTERRUPTED' });
    await expect(
      controller.operateExcel(
        { actions: ['verify_active_workbook'], workbookPath: WORKBOOK_PATH },
        new AbortController().signal,
      ),
    ).resolves.toBeUndefined();
    expect(operationCount).toBe(2);
    expect(maximumActiveOperations).toBe(1);
  });

  it('runs only the fixed Drive actions and does not log the Drive folder ID or local path', async () => {
    const folderId = '1DriveFolderVisibleDownload123';
    const downloadDirectory = '/approved/downloads';
    const actions: string[] = [];
    const driveDriver: VisibleDriveDriver = {
      async download(input, _signal, onAction) {
        expect(input.folderId).toBe(folderId);
        for (const action of [
          'drive.open_folder',
          'drive.select_items',
          'drive.download_items',
          'drive.verify_download',
        ] as const) {
          actions.push(action);
          await onAction(action);
        }
        return {
          inputHashes: ['a'.repeat(64)],
          paths: ['.ai-workflow-studio/jobs/run/report.xlsx'],
        };
      },
    };
    const { audits, controller } = setup({ driveDriver });
    controller.setEnabled(true);

    await expect(
      controller.downloadGoogleDriveFolder(
        {
          downloadDirectory,
          downloadTimeoutSeconds: 300,
          folderId,
          maxFileSizeBytes: 50_000_000,
          maxFiles: 500,
          workDirectory: '/approved/downloads/.ai-workflow-studio/jobs/run',
          workRelativePath: '.ai-workflow-studio/jobs/run',
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ paths: ['.ai-workflow-studio/jobs/run/report.xlsx'] });

    expect(actions).toEqual([
      'drive.open_folder',
      'drive.select_items',
      'drive.download_items',
      'drive.verify_download',
    ]);
    expect(controller.getSnapshot()).toMatchObject({
      lastCompletedAction: 'drive.verify_download',
      status: 'idle',
    });
    expect(audits.some((event) => event.code === 'VISIBLE_DRIVE_DOWNLOAD_COMPLETED')).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(folderId);
    expect(JSON.stringify(audits)).not.toContain(downloadDirectory);
  });

  it('maps visible Drive driver failures to stable Computer Use error codes', async () => {
    const driveDriver: VisibleDriveDriver = {
      async download() {
        throw new VisibleDriveError('DRIVE_DOWNLOAD_FOLDER_MISMATCH_OR_TIMEOUT');
      },
    };
    const { controller } = setup({ driveDriver });
    controller.setEnabled(true);

    await expect(
      controller.downloadGoogleDriveFolder(
        {
          downloadDirectory: '/approved/downloads',
          downloadTimeoutSeconds: 30,
          folderId: '1DriveFolderVisibleDownload123',
          maxFileSizeBytes: 50_000_000,
          maxFiles: 10,
          workDirectory: '/approved/downloads/.ai-workflow-studio/jobs/run',
          workRelativePath: '.ai-workflow-studio/jobs/run',
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD_FOLDER_MISMATCH_OR_TIMEOUT' });
    expect(controller.getSnapshot().status).toBe('failed');
  });
});

it.runIf(process.platform === 'darwin')(
  'compiles the fixed macOS Excel automation script without executing it',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-excel-script-'));
    const compiledPath = join(directory, 'visible-excel.scpt');
    await new Promise<void>((resolve, reject) => {
      execFile(
        '/usr/bin/osacompile',
        ['-o', compiledPath, '-e', MACOS_EXCEL_SCRIPT],
        { maxBuffer: 8_192, timeout: 10_000 },
        (error) => {
          if (error === null) resolve();
          else reject(error);
        },
      );
    });
  },
);

it.runIf(process.platform === 'darwin')(
  'compiles the fixed macOS Drive automation script without executing it',
  async () => {
    // Selection and Download now happen by dispatching real MouseEvents on the
    // located DOM elements, so no screen-coordinate math or synthetic keystrokes
    // remain in the visible-drive script.
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).not.toContain('click at {clickX, clickY}');
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).not.toContain('key code 0 using {command down}');
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).not.toContain('keystroke "a"');
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain('new MouseEvent(t,o)');
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain('shiftKey:true');
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain('b.dispatchEvent(new MouseEvent(t,o))');
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain(
      "return Number.isSafeInteger(count)&&count>0?String(count):'invalid'",
    );
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain(
      'return "requested:" & trustedWindowId & ":" & selectionCountText',
    );
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain("querySelectorAll('button,[role=button]')");
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain("if(e.length===0)return 'missing'");
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain('clickState is "missing"');
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).not.toContain(
      'The trusted Drive Download coordinate is invalid.',
    );
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).not.toContain('perform action "AXPress"');
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain('dialogState is "share"');
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain("t.indexOf('共用')===0");
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain("t.toLowerCase().indexOf('share')===0");
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).not.toContain('key code 53');
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).not.toContain(
      "querySelectorAll('[aria-label=下載],[aria-label=Download]",
    );
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain("location.pathname==='/drive/folders/");
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain('repeat with chromeWindow in windows');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'if sheetCount is not 1 or (count of sheets of front window) is not 1',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'The approved Google Drive folder changed before Save.',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain('entire contents of saveSheet');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain('saveAsNameTextField');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain('OKButton');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain('CancelButton');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain('where popup');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain('save-panel');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain('PathTextField');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain('key code 5 using {command down, shift down}');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'set proposedName to filePrefix & downloadExtension',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'selectedDirectoryName is not approvedDirectoryName',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).not.toContain('set the clipboard');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).not.toContain('do shell script');
    const directory = await mkdtemp(join(tmpdir(), 'aiws-drive-script-'));
    const sourcePath = join(directory, 'visible-drive.applescript');
    const compiledPath = join(directory, 'visible-drive.scpt');
    await writeFile(sourcePath, MACOS_VISIBLE_DRIVE_SCRIPT, 'utf8');
    await new Promise<void>((resolve, reject) => {
      execFile(
        '/usr/bin/osacompile',
        ['-o', compiledPath, sourcePath],
        { maxBuffer: 8_192, timeout: 10_000 },
        (error) => {
          if (error === null) resolve();
          else reject(error);
        },
      );
    });
    const saveDialogSourcePath = join(directory, 'drive-save-dialog.applescript');
    const saveDialogCompiledPath = join(directory, 'drive-save-dialog.scpt');
    await writeFile(saveDialogSourcePath, MACOS_DRIVE_SAVE_DIALOG_SCRIPT, 'utf8');
    await new Promise<void>((resolve, reject) => {
      execFile(
        '/usr/bin/osacompile',
        ['-o', saveDialogCompiledPath, saveDialogSourcePath],
        { maxBuffer: 8_192, timeout: 10_000 },
        (error) => {
          if (error === null) resolve();
          else reject(error);
        },
      );
    });
  },
);

it.runIf(process.platform === 'darwin' && process.env['AIWS_REAL_EXCEL_TEST'] === '1')(
  'visibly operates a real temporary workbook in Microsoft Excel',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-visible-excel-'));
    const workbookPath = join(directory, 'visible-excel-acceptance.xlsx');
    await writeSpreadsheetAtomic(
      [
        {
          columns: ['項目', '金額'],
          name: '驗收',
          rows: [
            { 金額: 120, 項目: '可見操作測試' },
            { 金額: 300, 項目: 'AI Workflow Studio' },
          ],
        },
      ],
      { outputPath: workbookPath, overwrite: false },
    );

    const controller = new DesktopComputerUseController({
      audit: () => undefined,
      driver: createPlatformExcelDriver('darwin'),
      onSnapshot: () => undefined,
      openPath: async (absolutePath) =>
        await new Promise<string>((resolve, reject) => {
          execFile(
            '/usr/bin/open',
            ['-a', 'Microsoft Excel', absolutePath],
            { maxBuffer: 8_192, timeout: 10_000 },
            (error) => {
              if (error === null) resolve('');
              else reject(error);
            },
          );
        }),
      permission: { check: () => 'granted' },
      platform: 'darwin',
      wait: async (_milliseconds, signal) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 2_500);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new ComputerUseError('COMPUTER_USE_INTERRUPTED'));
            },
            { once: true },
          );
        });
      },
    });
    controller.setEnabled(true);

    await expect(
      controller.operateExcel(
        {
          actions: ['autofit_used_range', 'save_workbook', 'verify_active_workbook'],
          workbookPath,
        },
        AbortSignal.timeout(150_000),
      ),
    ).resolves.toBeUndefined();
  },
  160_000,
);
