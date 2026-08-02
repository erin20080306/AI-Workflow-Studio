import { writeSpreadsheetAtomic } from '@ai-workflow-studio/local-executor';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
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

const WORKBOOK_PATH = '/approved/jobs/report.xlsx';

function setup(options?: {
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
