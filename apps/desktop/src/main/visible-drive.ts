import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import {
  type FileHandle,
  link,
  lstat,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, extname, isAbsolute, join } from 'node:path';
import type { Readable } from 'node:stream';

import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { z } from 'zod';

const ACTIVE_BASELINE_PARTIAL_MAX_AGE_MS = 30_000;
const DriveFolderIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,240}$/u);
const VisibleDriveInputSchema = z
  .object({
    downloadDirectory: z
      .string()
      .min(1)
      .max(4_096)
      .refine(isAbsolute, 'Download directory must be absolute')
      .refine((value) => !value.includes('\0'), 'Download directory is invalid'),
    downloadTimeoutSeconds: z.number().int().min(30).max(600),
    folderId: DriveFolderIdSchema,
    maxFileSizeBytes: z.number().int().min(1).max(200_000_000),
    maxFiles: z.number().int().min(1).max(500),
    workDirectory: z
      .string()
      .min(1)
      .max(4_096)
      .refine(isAbsolute, 'Work directory must be absolute')
      .refine((value) => !value.includes('\0'), 'Work directory is invalid'),
    workRelativePath: z.string().min(1).max(1_024),
  })
  .strict();

export type VisibleDriveAction =
  'drive.open_folder' | 'drive.select_items' | 'drive.download_items' | 'drive.verify_download';

export interface VisibleDriveDownloadInput {
  readonly downloadDirectory: string;
  readonly downloadTimeoutSeconds: number;
  readonly folderId: string;
  readonly maxFileSizeBytes: number;
  readonly maxFiles: number;
  readonly workDirectory: string;
  readonly workRelativePath: string;
}

export interface VisibleDriveDownloadResult {
  readonly inputHashes: readonly string[];
  readonly paths: readonly string[];
}

export interface VisibleDriveDriver {
  download(
    input: VisibleDriveDownloadInput,
    signal: AbortSignal,
    onAction: (action: VisibleDriveAction) => Promise<void>,
  ): Promise<VisibleDriveDownloadResult>;
}

export class VisibleDriveError extends Error {
  constructor(readonly code: string) {
    super('Visible Google Drive download could not complete.');
    this.name = 'VisibleDriveError';
  }
}

export function createPlatformVisibleDriveDriver(platform: NodeJS.Platform): VisibleDriveDriver {
  return {
    async download(input, signal, onAction) {
      const parsed = VisibleDriveInputSchema.parse(input);
      if (platform !== 'darwin') {
        throw new VisibleDriveError('VISIBLE_DRIVE_PLATFORM_UNSUPPORTED');
      }
      await verifyApprovedDirectories(parsed.downloadDirectory, parsed.workDirectory);

      await onAction('drive.open_folder');
      await runMacDriveAction(parsed.folderId, 'open_folder', signal);
      await abortableDelay(1_000, signal);

      await onAction('drive.select_items');
      const selectionAction = await runMacDriveAction(parsed.folderId, 'select_items', signal);
      const selectedCountMatch = /^selected:(\d{1,6})$/u.exec(selectionAction);
      const selectedCount = Number(selectedCountMatch?.[1]);
      if (
        !Number.isSafeInteger(selectedCount) ||
        selectedCount < 1 ||
        selectedCount > parsed.maxFiles
      ) {
        throw new VisibleDriveError('DRIVE_VISIBLE_SELECTION_FAILED');
      }

      await onAction('drive.download_items');
      const baseline = await snapshotDownloadDirectory(parsed.downloadDirectory);
      const startedAt = Date.now();
      assertNoActiveBaselinePartial(baseline, startedAt);
      const downloadAction = await runMacDriveAction(parsed.folderId, 'download_items', signal);
      const trustedWindowMatch = /^requested:(\d{1,20}):(\d{1,6})$/u.exec(downloadAction);
      const downloadSelectedCount = Number(trustedWindowMatch?.[2]);
      if (
        trustedWindowMatch?.[1] === undefined ||
        !Number.isSafeInteger(downloadSelectedCount) ||
        downloadSelectedCount !== selectedCount
      ) {
        throw new VisibleDriveError('DRIVE_VISIBLE_DOWNLOAD_ACTION_FAILED');
      }

      await onAction('drive.verify_download');
      const dialogAbortController = new AbortController();
      const dialogSignal = AbortSignal.any([signal, dialogAbortController.signal]);
      const dialogFilePrefix = `AIWS-${startedAt}-download`;
      let dialogHandled = false;
      let dialogFailure: unknown;
      const dialogMonitor = monitorMacDriveSaveDialog(
        parsed.folderId,
        trustedWindowMatch[1],
        parsed.downloadDirectory,
        dialogFilePrefix,
        parsed.downloadTimeoutSeconds,
        dialogSignal,
      )
        .then((handled) => {
          dialogHandled = handled;
        })
        .catch((error: unknown) => {
          if (
            shouldRecordDialogMonitorFailure(dialogAbortController.signal.aborted, signal.aborted)
          ) {
            dialogFailure = error;
          }
        });
      let downloaded: readonly string[];
      try {
        downloaded = await waitForCompletedDownloads(
          parsed.downloadDirectory,
          baseline,
          startedAt,
          parsed.downloadTimeoutSeconds * 1_000,
          signal,
          {
            dialogFilePrefix,
            expectedSelectedCount: selectedCount,
            getDialogFailure: () => dialogFailure,
            wasDialogHandled: () => dialogHandled,
          },
        );
      } finally {
        dialogAbortController.abort();
        await dialogMonitor;
      }
      if (dialogFailure !== undefined) throw dialogFailure;
      return await stageDownloadedWorkbooks(parsed, downloaded, signal);
    },
  };
}

export function shouldRecordDialogMonitorFailure(
  internalMonitorAborted: boolean,
  parentSignalAborted: boolean,
): boolean {
  return !internalMonitorAborted || parentSignalAborted;
}

export const MACOS_VISIBLE_DRIVE_SCRIPT = `on run argv
  set folderId to item 1 of argv
  set semanticAction to item 2 of argv
  set expectedUrl to "https://drive.google.com/drive/folders/" & folderId
  if semanticAction is "open_folder" then
    tell application "Google Chrome"
      activate
      if (count of windows) is 0 then make new window
      set URL of active tab of front window to expectedUrl
      delay 2
      set checkScript to "(function(){return location.origin==='https://drive.google.com'&&location.pathname==='/drive/folders/" & folderId & "'?'ready':'mismatch';})()"
      set pageState to execute active tab of front window javascript checkScript
      if pageState is not "ready" then error "The approved Google Drive folder is not active."
      return pageState
    end tell
  end if
  tell application "Google Chrome"
    activate
    set checkScript to "(function(){return location.origin==='https://drive.google.com'&&location.pathname==='/drive/folders/" & folderId & "'?'ready':'mismatch';})()"
    set pageState to execute active tab of front window javascript checkScript
    if pageState is not "ready" then error "The approved Google Drive folder changed."
  end tell
  if semanticAction is "select_items" then
    tell application "Google Chrome"
      set itemPoint to execute active tab of front window javascript "(function(){var c=Array.from(document.querySelectorAll('[role=gridcell][aria-label]')).find(function(v){var r=v.getBoundingClientRect();return v.offsetParent!==null&&r.width>8&&r.height>8&&r.bottom>0&&r.right>0&&r.top<window.innerHeight&&r.left<window.innerWidth;});if(!c)return 'no_items';var r=c.getBoundingClientRect();var x=Math.round(window.screenX+r.left+r.width/2);var y=Math.round(window.screenY+(window.outerHeight-window.innerHeight)+r.top+r.height/2);return x+','+y;})()"
      if itemPoint is "no_items" then error "No downloadable Drive items are visible."
    end tell
    set AppleScript's text item delimiters to ","
    set pointParts to text items of itemPoint
    if (count of pointParts) is not 2 then error "The visible Drive item coordinate is invalid."
    set clickX to item 1 of pointParts as integer
    set clickY to item 2 of pointParts as integer
    set AppleScript's text item delimiters to ""
    tell application "System Events"
      tell process "Google Chrome"
        set frontmost to true
        delay 1
        click at {clickX, clickY}
        delay 1
        key code 0 using {command down}
      end tell
    end tell
    delay 3
    tell application "Google Chrome"
      set selectionCountText to execute active tab of front window javascript "(function(){var text=(document.body&&document.body.innerText)||'';var match=text.match(/已選取\\\\s*([\\\\d,]+)\\\\s*個項目/)||text.match(/([\\\\d,]+)\\\\s+items?\\\\s+selected/i);var raw=match&&match[1];var count=raw?Number(raw.replace(/,/g,'')):0;return Number.isSafeInteger(count)&&count>0?String(count):'invalid';})()"
      if selectionCountText is "invalid" then error "Drive did not expose a trusted selected item count."
      return "selected:" & selectionCountText
    end tell
  end if
  if semanticAction is "download_items" then
    tell application "System Events"
      tell process "Google Chrome"
        if (count of windows) is 0 then error "The trusted Chrome window is unavailable."
        set nativeSheetCount to 0
        repeat with chromeWindow in windows
          set nativeSheetCount to nativeSheetCount + (count of sheets of chromeWindow)
        end repeat
        if nativeSheetCount is not 0 then error "A native Chrome dialog was already open."
      end tell
    end tell
    tell application "Google Chrome"
      set selectionCountText to execute active tab of front window javascript "(function(){var text=(document.body&&document.body.innerText)||'';var match=text.match(/已選取\\\\s*([\\\\d,]+)\\\\s*個項目/)||text.match(/([\\\\d,]+)\\\\s+items?\\\\s+selected/i);var raw=match&&match[1];var count=raw?Number(raw.replace(/,/g,'')):0;return Number.isSafeInteger(count)&&count>0?String(count):'invalid';})()"
      set downloadPoint to execute active tab of front window javascript "(function(){var e=Array.from(document.querySelectorAll('button,[role=button]')).filter(function(v){var l=(v.getAttribute('aria-label')||v.getAttribute('data-tooltip')||v.getAttribute('title')||'').trim();var r=v.getBoundingClientRect();if((l!=='下載'&&l!=='Download')||v.offsetParent===null||r.width<=8||r.height<=8||r.bottom<=0||r.right<=0||r.top>=window.innerHeight||r.left>=window.innerWidth)return false;var h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return h!==null&&h.closest('button,[role=button]')===v;});if(e.length!==1)return e.length===0?'missing':'ambiguous';var r=e[0].getBoundingClientRect();var x=Math.round(window.screenX+r.left+r.width/2);var y=Math.round(window.screenY+(window.outerHeight-window.innerHeight)+r.top+r.height/2);return x+','+y;})()"
      set trustedWindowId to id of front window as text
    end tell
    if selectionCountText is "invalid" then error "Drive did not expose a trusted selected item count before Download."
    if downloadPoint is "missing" or downloadPoint is "ambiguous" then error "The trusted Drive Download action is unavailable."
    set AppleScript's text item delimiters to ","
    set pointParts to text items of downloadPoint
    if (count of pointParts) is not 2 then error "The trusted Drive Download coordinate is invalid."
    set clickX to item 1 of pointParts as integer
    set clickY to item 2 of pointParts as integer
    set AppleScript's text item delimiters to ""
    tell application "System Events"
      tell process "Google Chrome"
        set frontmost to true
        delay 1
        click at {clickX, clickY}
      end tell
    end tell
    delay 1
    tell application "Google Chrome"
      set dialogState to execute active tab of front window javascript "(function(){var d=Array.from(document.querySelectorAll('[role=dialog]')).find(function(v){return v.offsetParent!==null;});if(!d)return 'clear';var t=(d.innerText||'').trim();return (t.indexOf('共用')===0||t.toLowerCase().indexOf('share')===0)?'share':'clear';})()"
    end tell
    if dialogState is "share" then
      tell application "System Events"
        tell process "Google Chrome"
          key code 53
        end tell
      end tell
      error "The Drive Share dialog opened instead of Download."
    end if
    tell application "Google Chrome"
      if (id of front window as text) is not trustedWindowId then error "The approved Chrome window changed during Download."
    end tell
    return "requested:" & trustedWindowId & ":" & selectionCountText
  end if
  error "Unsupported visible Drive action."
end run`;

export const MACOS_DRIVE_SAVE_DIALOG_SCRIPT = `use framework "Foundation"
use scripting additions

on run argv
  set folderId to item 1 of argv
  set trustedWindowId to item 2 of argv as text
  set approvedDirectory to item 3 of argv
  set filePrefix to item 4 of argv
  set waitSeconds to item 5 of argv as integer
  if approvedDirectory does not start with "/" then error "The approved download directory is invalid."
  if filePrefix does not start with "AIWS-" then error "The approved download filename is invalid."
  if waitSeconds < 1 or waitSeconds > 600 then error "The download dialog wait is invalid."
  set expectedUrl to "https://drive.google.com/drive/folders/" & folderId
  set approvedDirectoryString to current application's NSString's stringWithString:approvedDirectory
  set approvedDirectoryName to approvedDirectoryString's lastPathComponent() as text
  tell application "Google Chrome"
    if (count of windows) is 0 then error "The trusted Chrome window is unavailable."
    if (id of front window as text) is not trustedWindowId then error "The approved Chrome window changed."
    set checkScript to "(function(){return location.origin==='https://drive.google.com'&&location.pathname==='/drive/folders/" & folderId & "'?'ready':'mismatch';})()"
    set pageState to execute active tab of front window javascript checkScript
    if pageState is not "ready" then error "The approved Google Drive folder changed."
  end tell
  set expiresAt to (current date) + waitSeconds
  repeat while (current date) is less than expiresAt
    set trustedSheetDetected to false
    tell application "System Events"
      if not (exists process "Google Chrome") then error "The trusted Chrome process is unavailable."
      tell process "Google Chrome"
        if (count of windows) is 0 then error "The trusted Chrome window is unavailable."
        set sheetCount to 0
        repeat with chromeWindow in windows
          set sheetCount to sheetCount + (count of sheets of chromeWindow)
        end repeat
        if sheetCount > 1 then error "The Chrome download dialog is ambiguous."
        if sheetCount is 1 then
          if (count of sheets of front window) is not 1 then error "The Chrome Save sheet is not attached to the approved Drive window."
          set trustedSheetDetected to true
        end if
      end tell
    end tell
    if trustedSheetDetected then
      tell application "Google Chrome"
        if (id of front window as text) is not trustedWindowId then error "The approved Chrome window changed before Save."
        set checkScript to "(function(){return location.origin==='https://drive.google.com'&&location.pathname==='/drive/folders/" & folderId & "'?'ready':'mismatch';})()"
        set pageState to execute active tab of front window javascript checkScript
        if pageState is not "ready" then error "The approved Google Drive folder changed before Save."
      end tell
      tell application "System Events"
        tell process "Google Chrome"
          set sheetCount to 0
          repeat with chromeWindow in windows
            set sheetCount to sheetCount + (count of sheets of chromeWindow)
          end repeat
          if sheetCount is not 1 or (count of sheets of front window) is not 1 then error "The Chrome download dialog changed."
          set frontmost to true
          set saveSheet to sheet 1 of front window
          set saveSheetRole to value of attribute "AXRole" of saveSheet as text
          set saveSheetSubrole to "AXUnknown"
          try
            set observedSaveSheetSubrole to value of attribute "AXSubrole" of saveSheet
            if observedSaveSheetSubrole is not missing value then set saveSheetSubrole to observedSaveSheetSubrole as text
          on error errorMessage number errorNumber
            if errorNumber is not -1728 then error errorMessage number errorNumber
          end try
          set saveSheetIdentifier to value of attribute "AXIdentifier" of saveSheet as text
          if saveSheetRole is not "AXSheet" then error "The Chrome Save sheet role is invalid."
          if saveSheetSubrole is not "AXDialog" and saveSheetSubrole is not "AXSystemDialog" and saveSheetSubrole is not "AXStandardWindow" and saveSheetSubrole is not "AXUnknown" then error "The Chrome Save sheet subrole is invalid."
          if saveSheetIdentifier is not "save-panel" then error "The Chrome Save sheet identifier is invalid."
          set filenameFields to {}
          set saveButtons to {}
          set cancelButtons to {}
          set wherePopups to {}
          repeat with candidateElement in entire contents of saveSheet
            try
              set candidateRole to value of attribute "AXRole" of candidateElement as text
              set candidateIdentifier to value of attribute "AXIdentifier" of candidateElement as text
              if candidateRole is "AXTextField" and candidateIdentifier is "saveAsNameTextField" then set end of filenameFields to contents of candidateElement
              if candidateRole is "AXButton" and candidateIdentifier is "OKButton" then set end of saveButtons to contents of candidateElement
              if candidateRole is "AXButton" and candidateIdentifier is "CancelButton" then set end of cancelButtons to contents of candidateElement
              if candidateRole is "AXPopUpButton" and candidateIdentifier is "where popup" then set end of wherePopups to contents of candidateElement
            end try
          end repeat
          if (count of filenameFields) is not 1 or (count of saveButtons) is not 1 or (count of cancelButtons) is not 1 or (count of wherePopups) is not 1 then error "The Chrome sheet is not a unique Save dialog."
          set filenameField to item 1 of filenameFields
          set saveButton to item 1 of saveButtons
          set wherePopup to item 1 of wherePopups
          set originalName to value of filenameField as text
          if (length of originalName) < 4 or (length of originalName) > 1024 then error "The Chrome Save filename is invalid."
          ignoring case
            if originalName ends with ".xlsx" then
              set downloadExtension to ".xlsx"
            else if originalName ends with ".xls" then
              set downloadExtension to ".xls"
            else if originalName ends with ".zip" then
              set downloadExtension to ".zip"
            else
              error "The Chrome Save filename type is invalid."
            end if
          end ignoring
          set proposedName to filePrefix & downloadExtension
          key code 5 using {command down, shift down}
          delay 0.5
          if (count of sheets of saveSheet) is not 1 then error "The Chrome location chooser is unavailable."
          set locationSheet to sheet 1 of saveSheet
          set locationFields to {}
          repeat with candidateElement in entire contents of locationSheet
            try
              set candidateRole to value of attribute "AXRole" of candidateElement as text
              set candidateIdentifier to value of attribute "AXIdentifier" of candidateElement as text
              if candidateRole is "AXTextField" and candidateIdentifier is "PathTextField" then set end of locationFields to contents of candidateElement
            end try
          end repeat
          if (count of locationFields) is not 1 then error "The Chrome location field is ambiguous."
          set value of item 1 of locationFields to approvedDirectory
          key code 36
          set locationClosed to false
          repeat 40 times
            if (count of sheets of saveSheet) is 0 then
              set locationClosed to true
              exit repeat
            end if
            delay 0.25
          end repeat
          if locationClosed is false then error "The approved download location was not accepted."
          set value of filenameField to proposedName
          delay 0.25
          set selectedDirectoryName to value of wherePopup as text
          if selectedDirectoryName is not approvedDirectoryName then error "The Chrome Save location is outside the approved directory."
          tell application "Google Chrome"
            if (id of front window as text) is not trustedWindowId then error "The approved Chrome window changed before confirmation."
            set checkScript to "(function(){return location.origin==='https://drive.google.com'&&location.pathname==='/drive/folders/" & folderId & "'?'ready':'mismatch';})()"
            set pageState to execute active tab of front window javascript checkScript
            if pageState is not "ready" then error "The approved Google Drive folder changed before confirmation."
          end tell
          click saveButton
          return "handled"
        end tell
      end tell
    end if
    delay 1
  end repeat
  return "not_found"
end run`;

async function runMacDriveAction(
  folderId: string,
  action: 'download_items' | 'open_folder' | 'select_items',
  signal: AbortSignal,
): Promise<string> {
  try {
    return (
      await runAllowlistedProcess(
        '/usr/bin/osascript',
        ['-e', MACOS_VISIBLE_DRIVE_SCRIPT, DriveFolderIdSchema.parse(folderId), action],
        signal,
      )
    ).trim();
  } catch (error) {
    const text = error instanceof Error ? error.message : '';
    if (
      text.includes('Apple Events') ||
      text.includes('Apple 事件') ||
      text.includes('JavaScript from Apple Events')
    ) {
      throw new VisibleDriveError('CHROME_APPLE_EVENTS_JAVASCRIPT_REQUIRED');
    }
    if (
      text.includes('not allowed assistive access') ||
      text.includes('不允許輔助取用') ||
      text.includes('不允許「osascript」傳送按鍵') ||
      text.includes('(1002)') ||
      text.includes('-25211')
    ) {
      throw new VisibleDriveError('COMPUTER_USE_PERMISSION_REQUIRED');
    }
    if (text.includes('native Chrome dialog was already open')) {
      throw new VisibleDriveError('DRIVE_DOWNLOAD_SAVE_DIALOG_ALREADY_OPEN');
    }
    if (action === 'select_items') {
      throw new VisibleDriveError('DRIVE_VISIBLE_SELECTION_FAILED');
    }
    if (action === 'download_items') {
      throw new VisibleDriveError('DRIVE_VISIBLE_DOWNLOAD_ACTION_FAILED');
    }
    throw new VisibleDriveError('DRIVE_VISIBLE_OPEN_FAILED');
  }
}

async function monitorMacDriveSaveDialog(
  folderId: string,
  trustedWindowId: string,
  approvedDirectory: string,
  filePrefix: string,
  waitSeconds: number,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const stdout = await runAllowlistedProcess(
      '/usr/bin/osascript',
      [
        '-e',
        MACOS_DRIVE_SAVE_DIALOG_SCRIPT,
        DriveFolderIdSchema.parse(folderId),
        z
          .string()
          .regex(/^\d{1,20}$/u)
          .parse(trustedWindowId),
        approvedDirectory,
        filePrefix,
        String(waitSeconds),
      ],
      signal,
      waitSeconds * 1_000 + 5_000,
    );
    const status = stdout.trim();
    if (status === 'handled') return true;
    if (status === 'not_found') return false;
    throw new VisibleDriveError('DRIVE_DOWNLOAD_SAVE_DIALOG_FAILED');
  } catch (error) {
    if (signal.aborted) throw new VisibleDriveError('COMPUTER_USE_INTERRUPTED');
    if (error instanceof VisibleDriveError) throw error;
    const errorText = error instanceof Error ? error.message : '';
    if (
      errorText.includes('not allowed assistive access') ||
      errorText.includes('不允許輔助取用') ||
      errorText.includes('不允許「osascript」傳送按鍵') ||
      errorText.includes('(1002)') ||
      errorText.includes('-25211')
    ) {
      throw new VisibleDriveError('COMPUTER_USE_PERMISSION_REQUIRED');
    }
    if (
      errorText.includes('not a unique Save dialog') ||
      errorText.includes('is ambiguous') ||
      errorText.includes('filename is invalid')
    ) {
      throw new VisibleDriveError('DRIVE_DOWNLOAD_SAVE_DIALOG_UNRECOGNIZED');
    }
    if (
      errorText.includes('location chooser is unavailable') ||
      errorText.includes('location was not accepted') ||
      errorText.includes('location cannot be verified') ||
      errorText.includes('location is invalid') ||
      errorText.includes('location is outside')
    ) {
      throw new VisibleDriveError('DRIVE_DOWNLOAD_SAVE_LOCATION_FAILED');
    }
    throw new VisibleDriveError('DRIVE_DOWNLOAD_SAVE_DIALOG_FAILED');
  }
}

async function verifyApprovedDirectories(
  downloadDirectory: string,
  workDirectory: string,
): Promise<void> {
  try {
    const downloadMetadata = await lstat(downloadDirectory);
    const workMetadata = await lstat(workDirectory);
    if (
      downloadMetadata.isSymbolicLink() ||
      !downloadMetadata.isDirectory() ||
      workMetadata.isSymbolicLink() ||
      !workMetadata.isDirectory()
    ) {
      throw new VisibleDriveError('DRIVE_DOWNLOAD_DIRECTORY_NOT_AUTHORIZED');
    }
    const canonicalDownload = await realpath(downloadDirectory);
    const canonicalWork = await realpath(workDirectory);
    if (
      canonicalDownload !== downloadDirectory ||
      canonicalWork !== workDirectory ||
      (canonicalWork !== canonicalDownload && !canonicalWork.startsWith(`${canonicalDownload}/`))
    ) {
      throw new VisibleDriveError('DRIVE_DOWNLOAD_DIRECTORY_NOT_AUTHORIZED');
    }
  } catch (error) {
    if (error instanceof VisibleDriveError) throw error;
    throw new VisibleDriveError('DRIVE_DOWNLOAD_DIRECTORY_NOT_AUTHORIZED');
  }
}

interface DownloadSnapshotEntry {
  readonly modifiedAt: number;
  readonly size: number;
}

export async function snapshotDownloadDirectory(
  directory: string,
): Promise<ReadonlyMap<string, DownloadSnapshotEntry>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const snapshot = new Map<string, DownloadSnapshotEntry>();
  for (const entry of entries) {
    if (!entry.isFile() || !isObservedDownload(entry.name)) continue;
    const metadata = await lstat(join(directory, entry.name));
    if (metadata.isSymbolicLink() || !metadata.isFile()) continue;
    snapshot.set(entry.name, { modifiedAt: metadata.mtimeMs, size: metadata.size });
  }
  return snapshot;
}

export function assertNoActiveBaselinePartial(
  baseline: ReadonlyMap<string, DownloadSnapshotEntry>,
  now = Date.now(),
): void {
  for (const [name, metadata] of baseline) {
    if (
      isPartialDownload(name) &&
      metadata.modifiedAt >= now - ACTIVE_BASELINE_PARTIAL_MAX_AGE_MS
    ) {
      throw new VisibleDriveError('DRIVE_DOWNLOAD_CONCURRENT_ACTIVITY');
    }
  }
}

interface DownloadWaitOptions {
  readonly dialogFilePrefix?: string;
  readonly expectedSelectedCount?: number;
  readonly getDialogFailure?: () => unknown;
  readonly pollIntervalMs?: number;
  readonly stablePollsRequired?: number;
  readonly wasDialogHandled?: () => boolean;
}

export async function waitForCompletedDownloads(
  directory: string,
  baseline: ReadonlyMap<string, DownloadSnapshotEntry>,
  startedAt: number,
  timeoutMs: number,
  signal: AbortSignal,
  options: DownloadWaitOptions = {},
): Promise<readonly string[]> {
  const deadline = Date.now() + timeoutMs;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const stablePollsRequired = options.stablePollsRequired ?? 4;
  const expectedSelectedCount = options.expectedSelectedCount ?? 1;
  if (!Number.isSafeInteger(expectedSelectedCount) || expectedSelectedCount < 1) {
    throw new VisibleDriveError('DRIVE_VISIBLE_SELECTION_FAILED');
  }
  const expectsArchive = expectedSelectedCount > 1;
  let stableSignature = '';
  let stablePolls = 0;
  let observedActivity = false;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new VisibleDriveError('COMPUTER_USE_INTERRUPTED');
    const dialogFailure = options.getDialogFailure?.();
    if (dialogFailure !== undefined) throw dialogFailure;
    const entries = await readdir(directory, { withFileTypes: true });
    const dialogHandled = options.wasDialogHandled?.() ?? false;
    const expectedPrefix = dialogHandled ? options.dialogFilePrefix?.toLowerCase() : undefined;
    let partial = false;
    const candidates: { readonly name: string; readonly size: number }[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !isObservedDownload(entry.name)) continue;
      const metadata = await lstat(join(directory, entry.name));
      if (metadata.isSymbolicLink() || !metadata.isFile()) continue;
      if (isPartialDownload(entry.name)) {
        if (baseline.has(entry.name)) continue;
        if (expectedPrefix !== undefined && !entry.name.toLowerCase().startsWith(expectedPrefix)) {
          continue;
        }
        if (expectsArchive && !entry.name.toLowerCase().endsWith('.zip.crdownload')) continue;
        if (metadata.mtimeMs >= startedAt - 2_000) {
          partial = true;
          observedActivity = true;
        }
        continue;
      }
      const previous = baseline.get(entry.name);
      if (previous !== undefined) {
        if (previous.modifiedAt !== metadata.mtimeMs || previous.size !== metadata.size) {
          throw new VisibleDriveError('DRIVE_DOWNLOAD_EXISTING_FILE_CHANGED');
        }
        continue;
      }
      if (baseline.has(`${entry.name}.crdownload`)) continue;
      if (metadata.mtimeMs < startedAt - 2_000) continue;
      if (expectedPrefix !== undefined && !entry.name.toLowerCase().startsWith(expectedPrefix)) {
        continue;
      }
      if (expectsArchive && extname(entry.name).toLowerCase() !== '.zip') continue;
      candidates.push({ name: entry.name, size: metadata.size });
      observedActivity = true;
    }
    candidates.sort((left, right) => left.name.localeCompare(right.name));
    const signature = JSON.stringify(candidates);
    if (!partial && candidates.length > 0 && signature === stableSignature) {
      stablePolls += 1;
      if (stablePolls >= stablePollsRequired) {
        if (candidates.length !== 1) {
          throw new VisibleDriveError('DRIVE_DOWNLOAD_AMBIGUOUS');
        }
        return candidates.map((entry) => join(directory, entry.name));
      }
    } else {
      stableSignature = signature;
      stablePolls = 0;
    }
    await abortableDelay(pollIntervalMs, signal);
  }
  const dialogFailure = options.getDialogFailure?.();
  if (dialogFailure !== undefined) throw dialogFailure;
  if (options.wasDialogHandled?.() === true) {
    throw new VisibleDriveError('DRIVE_DOWNLOAD_SAVE_LOCATION_UNVERIFIED');
  }
  throw new VisibleDriveError(
    observedActivity
      ? 'DRIVE_DOWNLOAD_INCOMPLETE_TIMEOUT'
      : 'DRIVE_DOWNLOAD_NOT_STARTED_OR_WRONG_LOCATION',
  );
}

export async function stageDownloadedWorkbooks(
  input: z.infer<typeof VisibleDriveInputSchema>,
  downloaded: readonly string[],
  signal: AbortSignal,
): Promise<VisibleDriveDownloadResult> {
  await verifyApprovedDirectories(input.downloadDirectory, input.workDirectory);
  if (downloaded.length !== 1) {
    throw new VisibleDriveError('DRIVE_DOWNLOAD_AMBIGUOUS');
  }
  const staged: { readonly hash: string; readonly name: string }[] = [];
  for (const source of downloaded) {
    throwIfAborted(signal);
    await verifyApprovedDirectories(input.downloadDirectory, input.workDirectory);
    const isArchive = extname(source).toLowerCase() === '.zip';
    const snapshotLimit = isArchive
      ? Math.min(2_000_000_000, input.maxFiles * input.maxFileSizeBytes)
      : input.maxFileSizeBytes;
    const snapshot = await createTrustedDownloadSnapshot(
      source,
      input.workDirectory,
      snapshotLimit,
      signal,
    );
    try {
      if (isArchive) {
        staged.push(...(await extractWorkbookArchive(snapshot, input, signal)));
        continue;
      }
      staged.push(
        await stageWorkbookFile(
          snapshot,
          `drive-download${extname(source).toLowerCase()}`,
          input,
          staged.length,
          signal,
        ),
      );
    } finally {
      await rm(snapshot, { force: true });
    }
  }
  throwIfAborted(signal);
  if (staged.length === 0) throw new VisibleDriveError('DRIVE_DOWNLOAD_NO_WORKBOOKS');
  if (staged.length > input.maxFiles) throw new VisibleDriveError('DRIVE_DOWNLOAD_TOO_MANY_FILES');
  return {
    inputHashes: staged.map((entry) => entry.hash),
    paths: staged.map((entry) => `${input.workRelativePath}/${entry.name}`),
  };
}

async function createTrustedDownloadSnapshot(
  source: string,
  workDirectory: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  throwIfAborted(signal);
  const sourceHandle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  const snapshot = join(
    workDirectory,
    `.${randomUUID()}.source-snapshot${extname(source).toLowerCase()}`,
  );
  let snapshotHandle: FileHandle | undefined;
  try {
    const sourceMetadataBefore = await sourceHandle.stat();
    if (
      sourceMetadataBefore.isSymbolicLink() ||
      !sourceMetadataBefore.isFile() ||
      sourceMetadataBefore.size < 1 ||
      sourceMetadataBefore.size > maxBytes
    ) {
      throw new VisibleDriveError('DRIVE_DOWNLOAD_FILE_SIZE_INVALID');
    }
    throwIfAborted(signal);
    snapshotHandle = await open(snapshot, 'wx', 0o600);
    const copyBuffer = Buffer.allocUnsafe(1_048_576);
    let copyOffset = 0;
    while (true) {
      throwIfAborted(signal);
      const { bytesRead } = await sourceHandle.read(
        copyBuffer,
        0,
        copyBuffer.byteLength,
        copyOffset,
      );
      if (bytesRead === 0) break;
      if (copyOffset + bytesRead > maxBytes) {
        throw new VisibleDriveError('DRIVE_DOWNLOAD_FILE_SIZE_INVALID');
      }
      let written = 0;
      while (written < bytesRead) {
        throwIfAborted(signal);
        const result = await snapshotHandle.write(
          copyBuffer,
          written,
          bytesRead - written,
          copyOffset + written,
        );
        written += result.bytesWritten;
      }
      copyOffset += bytesRead;
    }
    await snapshotHandle.sync();
    const sourceMetadataAfter = await sourceHandle.stat();
    const snapshotMetadata = await snapshotHandle.stat();
    if (
      !snapshotMetadata.isFile() ||
      snapshotMetadata.size !== sourceMetadataBefore.size ||
      sourceMetadataAfter.size !== sourceMetadataBefore.size ||
      sourceMetadataAfter.mtimeMs !== sourceMetadataBefore.mtimeMs
    ) {
      throw new VisibleDriveError('DRIVE_DOWNLOAD_SOURCE_CHANGED');
    }
    throwIfAborted(signal);
    return snapshot;
  } catch (error) {
    await rm(snapshot, { force: true });
    if (signal.aborted) throw new VisibleDriveError('COMPUTER_USE_INTERRUPTED');
    throw error;
  } finally {
    await snapshotHandle?.close();
    await sourceHandle.close();
  }
}

async function extractWorkbookArchive(
  archivePath: string,
  input: z.infer<typeof VisibleDriveInputSchema>,
  signal: AbortSignal,
): Promise<readonly { readonly hash: string; readonly name: string }[]> {
  throwIfAborted(signal);
  const archiveMetadata = await lstat(archivePath);
  const archiveLimit = Math.min(2_000_000_000, input.maxFiles * input.maxFileSizeBytes);
  if (
    !archiveMetadata.isFile() ||
    archiveMetadata.size < 1 ||
    archiveMetadata.size > archiveLimit
  ) {
    throw new VisibleDriveError('DRIVE_DOWNLOAD_ARCHIVE_SIZE_INVALID');
  }
  return await new Promise((resolve, reject) => {
    const outputs: { hash: string; name: string }[] = [];
    let totalBytes = 0;
    let totalEntries = 0;
    let settled = false;
    const entryLimit = Math.min(20_000, Math.max(2_000, input.maxFiles * 20));
    let openedZip: ZipFile | undefined;
    const cleanup = () => signal.removeEventListener('abort', abort);
    const fail = (zip: ZipFile | undefined, error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      zip?.close();
      reject(
        error instanceof VisibleDriveError
          ? error
          : new VisibleDriveError('DRIVE_DOWNLOAD_ARCHIVE_INVALID'),
      );
    };
    const abort = () => fail(openedZip, new VisibleDriveError('COMPUTER_USE_INTERRUPTED'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    yauzl.open(archivePath, { autoClose: true, lazyEntries: true }, (openError, zip) => {
      if (settled) {
        zip?.close();
        return;
      }
      if (openError !== null || zip === undefined) {
        fail(zip, openError);
        return;
      }
      openedZip = zip;
      zip.on('error', (error) => fail(zip, error));
      zip.on('end', () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(outputs);
      });
      zip.on('entry', (entry: Entry) => {
        totalEntries += 1;
        if (totalEntries > entryLimit) {
          fail(zip, new VisibleDriveError('DRIVE_DOWNLOAD_ARCHIVE_LIMIT_EXCEEDED'));
          return;
        }
        if (signal.aborted) {
          fail(zip, new VisibleDriveError('COMPUTER_USE_INTERRUPTED'));
          return;
        }
        void handleArchiveEntry(zip, entry, input, outputs, totalBytes, archiveLimit, signal)
          .then((bytes) => {
            if (signal.aborted) {
              fail(zip, new VisibleDriveError('COMPUTER_USE_INTERRUPTED'));
              return;
            }
            totalBytes = bytes;
            if (outputs.length > input.maxFiles || totalBytes > archiveLimit) {
              fail(zip, new VisibleDriveError('DRIVE_DOWNLOAD_ARCHIVE_LIMIT_EXCEEDED'));
              return;
            }
            zip.readEntry();
          })
          .catch((error: unknown) => fail(zip, error));
      });
      zip.readEntry();
    });
  });
}

async function handleArchiveEntry(
  zip: ZipFile,
  entry: Entry,
  input: z.infer<typeof VisibleDriveInputSchema>,
  outputs: { hash: string; name: string }[],
  totalBytes: number,
  archiveLimit: number,
  signal: AbortSignal,
): Promise<number> {
  throwIfAborted(signal);
  validateArchiveEntry(entry);
  if (/\/$/u.test(entry.fileName) || !isWorkbook(entry.fileName)) return totalBytes;
  if (outputs.length >= input.maxFiles || totalBytes + entry.uncompressedSize > archiveLimit) {
    throw new VisibleDriveError('DRIVE_DOWNLOAD_ARCHIVE_LIMIT_EXCEEDED');
  }
  if (entry.uncompressedSize < 1 || entry.uncompressedSize > input.maxFileSizeBytes) {
    throw new VisibleDriveError('DRIVE_DOWNLOAD_FILE_SIZE_INVALID');
  }
  const bytes = await readZipEntry(zip, entry, input.maxFileSizeBytes, signal);
  if (totalBytes + bytes.byteLength > archiveLimit) {
    throw new VisibleDriveError('DRIVE_DOWNLOAD_ARCHIVE_LIMIT_EXCEEDED');
  }
  const staged = await writeUniqueWorkbook(bytes, entry.fileName, input, outputs.length, signal, {
    reservedNames: new Set(outputs.map((output) => output.name)),
  });
  outputs.push(staged);
  return totalBytes + bytes.byteLength;
}

async function readZipEntry(
  zip: ZipFile,
  entry: Entry,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  throwIfAborted(signal);
  return await new Promise((resolve, reject) => {
    let settled = false;
    let activeStream: Readable | undefined;
    const cleanup = () => signal.removeEventListener('abort', abort);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      activeStream?.destroy();
      reject(error);
    };
    const abort = () => fail(new VisibleDriveError('COMPUTER_USE_INTERRUPTED'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    zip.openReadStream(entry, (error, stream) => {
      if (error !== null || stream === undefined) {
        fail(new VisibleDriveError('DRIVE_DOWNLOAD_ARCHIVE_INVALID'));
        return;
      }
      activeStream = stream;
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        if (settled) return;
        size += chunk.byteLength;
        if (size > maxBytes) {
          fail(new VisibleDriveError('DRIVE_DOWNLOAD_FILE_SIZE_INVALID'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', fail);
      stream.on('end', () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(Buffer.concat(chunks));
      });
    });
  });
}

async function stageWorkbookFile(
  source: string,
  sourceName: string,
  input: z.infer<typeof VisibleDriveInputSchema>,
  index: number,
  signal: AbortSignal,
): Promise<{ readonly hash: string; readonly name: string }> {
  throwIfAborted(signal);
  const handle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > input.maxFileSizeBytes) {
      throw new VisibleDriveError('DRIVE_DOWNLOAD_FILE_SIZE_INVALID');
    }
    const bytes = await readFile(handle, { signal });
    throwIfAborted(signal);
    return await writeUniqueWorkbook(bytes, sourceName, input, index, signal);
  } finally {
    await handle.close();
  }
}

async function writeUniqueWorkbook(
  bytes: Uint8Array,
  sourceName: string,
  input: z.infer<typeof VisibleDriveInputSchema>,
  index: number,
  signal: AbortSignal,
  options: { readonly reservedNames?: ReadonlySet<string> } = {},
): Promise<{ readonly hash: string; readonly name: string }> {
  throwIfAborted(signal);
  const safeName = safeWorkbookName(sourceName, index);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const reservedNameKeys = new Set(
    [...(options.reservedNames ?? [])].map((name) => macosFilenameKey(name)),
  );
  let outputName = safeName;
  let suffix = 2;
  while (true) {
    throwIfAborted(signal);
    await verifyApprovedDirectories(input.downloadDirectory, input.workDirectory);
    if (reservedNameKeys.has(macosFilenameKey(outputName))) {
      const extension = extname(safeName);
      outputName = `${safeName.slice(0, -extension.length)}-${suffix}${extension}`;
      suffix += 1;
      continue;
    }
    const target = join(input.workDirectory, outputName);
    const temporary = join(input.workDirectory, `.${randomUUID()}.visible-download`);
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600, signal });
      throwIfAborted(signal);
      await link(temporary, target);
      if (signal.aborted) {
        await rm(target, { force: true });
        throw new VisibleDriveError('COMPUTER_USE_INTERRUPTED');
      }
      return { hash, name: outputName };
    } catch (error) {
      if (signal.aborted) throw new VisibleDriveError('COMPUTER_USE_INTERRUPTED');
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existingHash = await readExistingHashNoFollow(target, input.maxFileSizeBytes, signal);
      if (existingHash === undefined) continue;
      if (existingHash === hash) {
        return { hash, name: outputName };
      }
      const extension = extname(safeName);
      outputName = `${safeName.slice(0, -extension.length)}-${suffix}${extension}`;
      suffix += 1;
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

function macosFilenameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

async function readExistingHashNoFollow(
  target: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string | undefined> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size < 1 ||
      metadata.size > maxBytes
    ) {
      throw new VisibleDriveError('DRIVE_DOWNLOAD_OUTPUT_CONFLICT');
    }
    const bytes = await readFile(handle, { signal });
    return createHash('sha256').update(bytes).digest('hex');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    if (signal.aborted) throw new VisibleDriveError('COMPUTER_USE_INTERRUPTED');
    if (error instanceof VisibleDriveError) throw error;
    throw new VisibleDriveError('DRIVE_DOWNLOAD_OUTPUT_CONFLICT');
  } finally {
    await handle?.close();
  }
}

function validateArchiveEntry(entry: Entry): void {
  const normalized = entry.fileName.replaceAll('\\', '/');
  const segments = normalized.split('/');
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const unixFileType = unixMode & 0o170000;
  if (
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized) ||
    segments.includes('..') ||
    (entry.generalPurposeBitFlag & 0x1) !== 0 ||
    unixFileType === 0o120000
  ) {
    throw new VisibleDriveError('DRIVE_DOWNLOAD_ARCHIVE_INVALID');
  }
  if (
    entry.uncompressedSize > 1_000_000 &&
    entry.compressedSize > 0 &&
    entry.uncompressedSize / entry.compressedSize > 200
  ) {
    throw new VisibleDriveError('DRIVE_DOWNLOAD_ARCHIVE_LIMIT_EXCEEDED');
  }
}

function safeWorkbookName(sourceName: string, index: number): string {
  const normalized = basename(sourceName.replaceAll('\\', '/')).normalize('NFC');
  const flattened = [...normalized]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127 ? '_' : character;
    })
    .join('')
    .trim();
  const extension = extname(flattened).toLowerCase();
  if (extension !== '.xls' && extension !== '.xlsx') {
    throw new VisibleDriveError('DRIVE_DOWNLOAD_FILE_TYPE_INVALID');
  }
  const ownDownloadName = /^AIWS-\d{10,16}-download$/iu.test(flattened.slice(0, -extension.length));
  const sourceStem = ownDownloadName
    ? 'drive-download'
    : flattened.slice(0, -extension.length).trim();
  const stem = truncateUtf8(sourceStem, 220 - Buffer.byteLength(extension));
  return `${stem || `workbook-${index + 1}`}${extension}`;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = '';
  for (const character of value) {
    if (Buffer.byteLength(result) + Buffer.byteLength(character) > maxBytes) break;
    result += character;
  }
  return result;
}

function isWorkbook(name: string): boolean {
  const extension = extname(name).toLowerCase();
  return extension === '.xls' || extension === '.xlsx';
}

function isSupportedDownload(name: string): boolean {
  return isWorkbook(name) || extname(name).toLowerCase() === '.zip';
}

function isPartialDownload(name: string): boolean {
  return name.toLowerCase().endsWith('.crdownload');
}

function isObservedDownload(name: string): boolean {
  return isSupportedDownload(name) || isPartialDownload(name);
}

async function runAllowlistedProcess(
  executable: string,
  arguments_: readonly string[],
  signal: AbortSignal,
  timeoutMs = 60_000,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    execFile(
      executable,
      [...arguments_],
      { maxBuffer: 8_192, signal, timeout: timeoutMs, windowsHide: false },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(stderr.trim() || 'The allowlisted process failed.'));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new VisibleDriveError('COMPUTER_USE_INTERRUPTED');
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
      reject(new VisibleDriveError('COMPUTER_USE_INTERRUPTED'));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}
