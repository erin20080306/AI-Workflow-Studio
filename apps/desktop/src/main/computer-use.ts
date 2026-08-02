import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { basename, extname, isAbsolute } from 'node:path';
import { z } from 'zod';

import type { ComputerUseSnapshot } from '../shared/contracts';

const VisibleExcelActionSchema = z.enum([
  'autofit_used_range',
  'save_workbook',
  'verify_active_workbook',
]);
const VisibleExcelInputSchema = z
  .object({
    actions: z.array(VisibleExcelActionSchema).min(1).max(3),
    workbookPath: z
      .string()
      .min(1)
      .max(4_096)
      .refine(isAbsolute, 'Workbook path must be absolute')
      .refine((value) => extname(value).toLowerCase() === '.xlsx', 'Workbook must be .xlsx'),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.actions).size !== input.actions.length) {
      context.addIssue({
        code: 'custom',
        message: 'Visible Excel actions must be unique',
        path: ['actions'],
      });
    }
    if (input.actions.at(-1) !== 'verify_active_workbook') {
      context.addIssue({
        code: 'custom',
        message: 'Visible Excel operation must end by verifying the active workbook',
        path: ['actions'],
      });
    }
  });

export type VisibleExcelAction = z.infer<typeof VisibleExcelActionSchema>;

export interface ComputerUseAuditEvent {
  readonly code: string;
  readonly level: 'error' | 'info' | 'warn';
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ComputerUsePermissionProvider {
  check(prompt: boolean): ComputerUseSnapshot['permission'];
}

export interface VisibleExcelDriver {
  perform(
    input: {
      readonly action: VisibleExcelAction;
      readonly workbookPath: string;
    },
    signal: AbortSignal,
  ): Promise<{ readonly activeWorkbookName: string }>;
}

interface DesktopComputerUseControllerOptions {
  readonly audit: (event: ComputerUseAuditEvent) => void;
  readonly driver: VisibleExcelDriver;
  readonly onSnapshot: () => void;
  readonly openPath: (absolutePath: string) => Promise<string>;
  readonly permission: ComputerUsePermissionProvider;
  readonly platform: NodeJS.Platform;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export class ComputerUseError extends Error {
  constructor(readonly code: string) {
    super('Visible Computer Use could not complete.');
    this.name = 'ComputerUseError';
  }
}

export class DesktopComputerUseController {
  private activeAbortController: AbortController | undefined;
  private currentAction: ComputerUseSnapshot['currentAction'];
  private enabled = false;
  private lastCompletedAction: ComputerUseSnapshot['lastCompletedAction'];
  private status: ComputerUseSnapshot['status'] = 'idle';

  constructor(private readonly options: DesktopComputerUseControllerOptions) {}

  getSnapshot(): ComputerUseSnapshot {
    return {
      ...(this.currentAction === undefined ? {} : { currentAction: this.currentAction }),
      enabled: this.enabled,
      ...(this.lastCompletedAction === undefined
        ? {}
        : { lastCompletedAction: this.lastCompletedAction }),
      permission: this.options.permission.check(false),
      platform: platformLabel(this.options.platform),
      status: this.status,
      takeoverAvailable: this.activeAbortController !== undefined,
    };
  }

  requestPermission(): ComputerUseSnapshot['permission'] {
    const permission = this.options.permission.check(true);
    if (permission !== 'granted') {
      this.status = permission === 'unsupported' ? 'unsupported' : 'permission_denied';
      this.options.onSnapshot();
    }
    return permission;
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) {
      this.takeOver();
      this.currentAction = undefined;
      this.status = 'idle';
    }
    this.enabled = enabled;
    if (enabled && this.status !== 'running') this.status = 'idle';
    this.options.onSnapshot();
  }

  takeOver(): void {
    if (this.activeAbortController !== undefined) {
      this.activeAbortController.abort();
      this.activeAbortController = undefined;
      this.currentAction = undefined;
      this.status = 'user_takeover';
      this.options.audit({
        code: 'COMPUTER_USE_USER_TAKEOVER',
        level: 'warn',
        metadata: { platform: platformLabel(this.options.platform) },
      });
      this.options.onSnapshot();
    }
  }

  async operateExcel(
    input: { readonly actions: readonly VisibleExcelAction[]; readonly workbookPath: string },
    parentSignal: AbortSignal,
    onAction: (
      action: NonNullable<ComputerUseSnapshot['currentAction']>,
    ) => Promise<void> = async () => undefined,
  ): Promise<void> {
    if (!this.enabled) throw new ComputerUseError('COMPUTER_USE_DISABLED');
    const permission = this.options.permission.check(false);
    if (permission !== 'granted') {
      this.status = permission === 'unsupported' ? 'unsupported' : 'permission_denied';
      this.options.onSnapshot();
      throw new ComputerUseError(
        permission === 'unsupported'
          ? 'COMPUTER_USE_PLATFORM_UNSUPPORTED'
          : 'COMPUTER_USE_PERMISSION_REQUIRED',
      );
    }
    const parsed = VisibleExcelInputSchema.parse(input);
    const expectedName = basename(parsed.workbookPath);
    const workbookPathHash = createHash('sha256').update(parsed.workbookPath).digest('hex');
    const localAbortController = new AbortController();
    this.activeAbortController = localAbortController;
    const signal = AbortSignal.any([parentSignal, localAbortController.signal]);

    try {
      await this.updateStatus('opening_excel', 'excel.open_workbook', onAction);
      const openError = await this.options.openPath(parsed.workbookPath);
      if (openError.trim() !== '') throw new ComputerUseError('EXCEL_OPEN_FAILED');
      await (this.options.wait ?? abortableDelay)(1_200, signal);

      for (const action of parsed.actions) {
        const actionCode = visibleActionCode(action);
        await this.updateStatus(
          action === 'verify_active_workbook' ? 'verifying' : 'running',
          actionCode,
          onAction,
        );
        const result = await this.options.driver.perform(
          { action, workbookPath: parsed.workbookPath },
          signal,
        );
        if (
          action === 'verify_active_workbook' &&
          result.activeWorkbookName.trim().toLowerCase() !== expectedName.toLowerCase()
        ) {
          throw new ComputerUseError('EXCEL_STATE_VERIFICATION_FAILED');
        }
      }
      this.lastCompletedAction = 'excel.verify_active_workbook';
      this.currentAction = undefined;
      this.status = 'idle';
      this.options.audit({
        code: 'VISIBLE_EXCEL_OPERATION_COMPLETED',
        level: 'info',
        metadata: {
          actionCount: parsed.actions.length + 1,
          platform: platformLabel(this.options.platform),
          workbookPathHash,
        },
      });
      this.options.onSnapshot();
    } catch (error) {
      if (signal.aborted) {
        this.status = localAbortController.signal.aborted ? 'user_takeover' : 'failed';
        this.currentAction = undefined;
        throw new ComputerUseError('COMPUTER_USE_INTERRUPTED');
      }
      this.status =
        error instanceof ComputerUseError && error.code === 'COMPUTER_USE_PERMISSION_REQUIRED'
          ? 'permission_denied'
          : 'failed';
      this.currentAction = undefined;
      this.options.audit({
        code: 'VISIBLE_EXCEL_OPERATION_FAILED',
        level: 'error',
        metadata: {
          failureCode: error instanceof ComputerUseError ? error.code : 'DRIVER_FAILURE',
          platform: platformLabel(this.options.platform),
          workbookPathHash,
        },
      });
      this.options.onSnapshot();
      throw error;
    } finally {
      this.activeAbortController = undefined;
      this.options.onSnapshot();
    }
  }

  private async updateStatus(
    status: ComputerUseSnapshot['status'],
    action: NonNullable<ComputerUseSnapshot['currentAction']>,
    onAction: (action: NonNullable<ComputerUseSnapshot['currentAction']>) => Promise<void>,
  ): Promise<void> {
    this.status = status;
    this.currentAction = action;
    this.lastCompletedAction = undefined;
    this.options.audit({
      code: 'COMPUTER_USE_ACTION_STARTED',
      level: 'info',
      metadata: { action, platform: platformLabel(this.options.platform) },
    });
    this.options.onSnapshot();
    await onAction(action);
  }
}

export function createPlatformExcelDriver(platform: NodeJS.Platform): VisibleExcelDriver {
  return {
    async perform(input, signal) {
      const expectedName = basename(input.workbookPath);
      const expectedStem = basename(input.workbookPath, extname(input.workbookPath));
      if (platform === 'darwin') {
        const stdout = await runAllowlistedProcess(
          '/usr/bin/osascript',
          ['-e', MACOS_EXCEL_SCRIPT, expectedName, expectedStem, input.action],
          signal,
        );
        return { activeWorkbookName: stdout.trim() };
      }
      if (platform === 'win32') {
        const stdout = await runAllowlistedProcess(
          'powershell.exe',
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            WINDOWS_EXCEL_SCRIPT,
            expectedName,
            expectedStem,
            input.action,
          ],
          signal,
        );
        return { activeWorkbookName: stdout.trim() };
      }
      throw new ComputerUseError('COMPUTER_USE_PLATFORM_UNSUPPORTED');
    },
  };
}

export const MACOS_EXCEL_SCRIPT = `on run argv
  set expectedName to item 1 of argv
  set expectedStem to item 2 of argv
  set semanticAction to item 3 of argv
  with timeout of 45 seconds
    tell application "Microsoft Excel" to activate
    tell application "System Events"
      tell process "Microsoft Excel"
        set frontmost to true
        delay 0.4
        if (count of windows) is 0 then error "Microsoft Excel has no visible workbook window."
        set activeWindowName to name of front window as text
        if activeWindowName does not contain expectedName and activeWindowName does not contain expectedStem then
          error "The approved workbook is not the frontmost Microsoft Excel window."
        end if
      if semanticAction is "autofit_used_range" then
          keystroke "a" using {command down}
          delay 0.2
          keystroke "a" using {command down}
          delay 0.2
          keystroke "0" using {command down, option down}
          delay 0.3
          keystroke "9" using {command down, option down}
      else if semanticAction is "save_workbook" then
          keystroke "s" using {command down}
          delay 0.5
      end if
        set verifiedWindowName to name of front window as text
        if verifiedWindowName does not contain expectedName and verifiedWindowName does not contain expectedStem then
          error "Microsoft Excel changed away from the approved workbook."
        end if
        return expectedName
      end tell
    end tell
  end timeout
end run`;

const WINDOWS_EXCEL_SCRIPT = `$ErrorActionPreference = 'Stop'
$expectedName = $args[0]
$expectedStem = $args[1]
$semanticAction = $args[2]
$excelProcess = Get-Process EXCEL | Where-Object {
  $_.MainWindowTitle.Contains($expectedName) -or $_.MainWindowTitle.Contains($expectedStem)
} | Select-Object -First 1
if ($null -eq $excelProcess) { throw 'The approved workbook is not visible in Microsoft Excel.' }
$keyboard = New-Object -ComObject WScript.Shell
if (-not $keyboard.AppActivate($excelProcess.Id)) { throw 'Microsoft Excel could not be focused.' }
Start-Sleep -Milliseconds 400
if ($semanticAction -eq 'autofit_used_range') {
  $keyboard.SendKeys('^a')
  Start-Sleep -Milliseconds 200
  $keyboard.SendKeys('^a')
  Start-Sleep -Milliseconds 200
  $keyboard.SendKeys('%hoi')
  Start-Sleep -Milliseconds 300
  $keyboard.SendKeys('%hoa')
}
if ($semanticAction -eq 'save_workbook') {
  $keyboard.SendKeys('^s')
  Start-Sleep -Milliseconds 500
}
$excelProcess.Refresh()
if (-not ($excelProcess.MainWindowTitle.Contains($expectedName) -or $excelProcess.MainWindowTitle.Contains($expectedStem))) {
  throw 'Microsoft Excel changed away from the approved workbook.'
}
[Console]::Out.Write($expectedName)`;

async function runAllowlistedProcess(
  executable: string,
  arguments_: readonly string[],
  signal: AbortSignal,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    execFile(
      executable,
      [...arguments_],
      { maxBuffer: 8_192, signal, timeout: 60_000, windowsHide: false },
      (error, stdout, stderr) => {
        if (error !== null) {
          if (
            stderr.includes('-25211') ||
            stderr.includes('not allowed assistive access') ||
            stderr.includes('不允許輔助取用')
          ) {
            reject(new ComputerUseError('COMPUTER_USE_PERMISSION_REQUIRED'));
            return;
          }
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function platformLabel(platform: NodeJS.Platform): ComputerUseSnapshot['platform'] {
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  return 'unsupported';
}

function visibleActionCode(
  action: VisibleExcelAction,
): NonNullable<ComputerUseSnapshot['currentAction']> {
  if (action === 'autofit_used_range') return 'excel.autofit_used_range';
  if (action === 'save_workbook') return 'excel.save_workbook';
  return 'excel.verify_active_workbook';
}

async function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new ComputerUseError('COMPUTER_USE_INTERRUPTED'));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}
