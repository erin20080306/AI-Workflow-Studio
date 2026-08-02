import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { z } from 'zod';

const DriveFolderIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,240}$/u);
const VisibleDriveInputSchema = z
  .object({
    downloadDirectory: z.string().min(1).max(4_096),
    downloadTimeoutSeconds: z.number().int().min(30).max(600),
    folderId: DriveFolderIdSchema,
    maxFileSizeBytes: z.number().int().min(1).max(200_000_000),
    maxFiles: z.number().int().min(1).max(500),
    workDirectory: z.string().min(1).max(4_096),
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
      const baseline = await snapshotSupportedDownloads(parsed.downloadDirectory);
      const startedAt = Date.now();

      await onAction('drive.open_folder');
      await runMacDriveAction(parsed.folderId, 'open_folder', signal);
      await abortableDelay(1_000, signal);

      await onAction('drive.select_items');
      await runMacDriveAction(parsed.folderId, 'select_items', signal);

      await onAction('drive.download_items');
      await runMacDriveAction(parsed.folderId, 'download_items', signal);

      await onAction('drive.verify_download');
      const downloaded = await waitForCompletedDownloads(
        parsed.downloadDirectory,
        baseline,
        startedAt,
        parsed.downloadTimeoutSeconds * 1_000,
        signal,
      );
      return await stageDownloadedWorkbooks(parsed, downloaded);
    },
  };
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
      set checkScript to "(function(){return location.origin==='https://drive.google.com'&&location.pathname.indexOf('/drive/folders/" & folderId & "')===0?'ready':'mismatch';})()"
      set pageState to execute active tab of front window javascript checkScript
      if pageState is not "ready" then error "The approved Google Drive folder is not active."
      return pageState
    end tell
  end if
  tell application "Google Chrome"
    activate
    set checkScript to "(function(){return location.origin==='https://drive.google.com'&&location.pathname.indexOf('/drive/folders/" & folderId & "')===0?'ready':'mismatch';})()"
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
        click at {clickX, clickY}
        delay 1
        key code 0 using {command down}
      end tell
    end tell
    delay 3
    tell application "Google Chrome"
      set selectionState to execute active tab of front window javascript "(function(){var cells=Array.from(document.querySelectorAll('[role=gridcell][aria-label]')).filter(function(v){var r=v.getBoundingClientRect();return v.offsetParent!==null&&r.width>8&&r.height>8;});var text=(document.body&&document.body.innerText)||'';var match=text.match(/已選取\\\\s*([\\\\d,]+)\\\\s*個項目/)|text.match(/([\\\\d,]+)\\\\s+items?\\\\s+selected/i);var count=match?Number(match[1].replace(/,/g,'')):cells.filter(function(v){return v.getAttribute('aria-selected')==='true'||v.querySelector('[aria-selected=true]');}).length;return cells.length<=1||count>1?'selected':'single';})()"
      if selectionState is not "selected" then error "Drive did not select every visible item."
      return selectionState
    end tell
  end if
  if semanticAction is "download_items" then
    tell application "Google Chrome"
      set downloadPoint to execute active tab of front window javascript "(function(){var e=Array.from(document.querySelectorAll('button,[role=button]')).filter(function(v){var l=(v.getAttribute('aria-label')||v.getAttribute('data-tooltip')||v.getAttribute('title')||'').trim();var r=v.getBoundingClientRect();if((l!=='下載'&&l!=='Download')||v.offsetParent===null||r.width<=8||r.height<=8||r.bottom<=0||r.right<=0||r.top>=window.innerHeight||r.left>=window.innerWidth)return false;var h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return h!==null&&h.closest('button,[role=button]')===v;});if(e.length!==1)return e.length===0?'missing':'ambiguous';var r=e[0].getBoundingClientRect();var x=Math.round(window.screenX+r.left+r.width/2);var y=Math.round(window.screenY+(window.outerHeight-window.innerHeight)+r.top+r.height/2);return x+','+y;})()"
    end tell
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
    return "requested"
  end if
  error "Unsupported visible Drive action."
end run`;

async function runMacDriveAction(
  folderId: string,
  action: 'download_items' | 'open_folder' | 'select_items',
  signal: AbortSignal,
): Promise<void> {
  try {
    await runAllowlistedProcess(
      '/usr/bin/osascript',
      ['-e', MACOS_VISIBLE_DRIVE_SCRIPT, DriveFolderIdSchema.parse(folderId), action],
      signal,
    );
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
    if (action === 'select_items') {
      throw new VisibleDriveError('DRIVE_VISIBLE_SELECTION_FAILED');
    }
    if (action === 'download_items') {
      throw new VisibleDriveError('DRIVE_VISIBLE_DOWNLOAD_ACTION_FAILED');
    }
    throw new VisibleDriveError('DRIVE_VISIBLE_OPEN_FAILED');
  }
}

interface DownloadSnapshotEntry {
  readonly modifiedAt: number;
  readonly size: number;
}

async function snapshotSupportedDownloads(
  directory: string,
): Promise<ReadonlyMap<string, DownloadSnapshotEntry>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const snapshot = new Map<string, DownloadSnapshotEntry>();
  for (const entry of entries) {
    if (!entry.isFile() || !isSupportedDownload(entry.name)) continue;
    const metadata = await lstat(join(directory, entry.name));
    if (metadata.isSymbolicLink() || !metadata.isFile()) continue;
    snapshot.set(entry.name, { modifiedAt: metadata.mtimeMs, size: metadata.size });
  }
  return snapshot;
}

async function waitForCompletedDownloads(
  directory: string,
  baseline: ReadonlyMap<string, DownloadSnapshotEntry>,
  startedAt: number,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<readonly string[]> {
  const deadline = Date.now() + timeoutMs;
  let stableSignature = '';
  let stablePolls = 0;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new VisibleDriveError('COMPUTER_USE_INTERRUPTED');
    const entries = await readdir(directory, { withFileTypes: true });
    const partial = entries.some(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.crdownload'),
    );
    const candidates: { readonly name: string; readonly size: number }[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !isSupportedDownload(entry.name)) continue;
      const metadata = await lstat(join(directory, entry.name));
      if (metadata.isSymbolicLink() || !metadata.isFile()) continue;
      const previous = baseline.get(entry.name);
      if (
        metadata.mtimeMs < startedAt - 2_000 ||
        (previous !== undefined &&
          previous.modifiedAt === metadata.mtimeMs &&
          previous.size === metadata.size)
      ) {
        continue;
      }
      candidates.push({ name: entry.name, size: metadata.size });
    }
    candidates.sort((left, right) => left.name.localeCompare(right.name));
    const signature = JSON.stringify(candidates);
    if (!partial && candidates.length > 0 && signature === stableSignature) {
      stablePolls += 1;
      if (stablePolls >= 4) {
        const archives = candidates.filter((entry) => extname(entry.name).toLowerCase() === '.zip');
        if (archives.length > 1 || (archives.length === 1 && candidates.length > 1)) {
          throw new VisibleDriveError('DRIVE_DOWNLOAD_AMBIGUOUS');
        }
        return candidates.map((entry) => join(directory, entry.name));
      }
    } else {
      stableSignature = signature;
      stablePolls = 0;
    }
    await abortableDelay(500, signal);
  }
  throw new VisibleDriveError('DRIVE_DOWNLOAD_FOLDER_MISMATCH_OR_TIMEOUT');
}

async function stageDownloadedWorkbooks(
  input: z.infer<typeof VisibleDriveInputSchema>,
  downloaded: readonly string[],
): Promise<VisibleDriveDownloadResult> {
  const staged: { readonly hash: string; readonly name: string }[] = [];
  for (const source of downloaded) {
    if (extname(source).toLowerCase() === '.zip') {
      staged.push(...(await extractWorkbookArchive(source, input)));
      continue;
    }
    staged.push(await stageWorkbookFile(source, basename(source), input, staged.length));
  }
  if (staged.length === 0) throw new VisibleDriveError('DRIVE_DOWNLOAD_NO_WORKBOOKS');
  if (staged.length > input.maxFiles) throw new VisibleDriveError('DRIVE_DOWNLOAD_TOO_MANY_FILES');
  return {
    inputHashes: staged.map((entry) => entry.hash),
    paths: staged.map((entry) => `${input.workRelativePath}/${entry.name}`),
  };
}

async function extractWorkbookArchive(
  archivePath: string,
  input: z.infer<typeof VisibleDriveInputSchema>,
): Promise<readonly { readonly hash: string; readonly name: string }[]> {
  const archiveMetadata = await stat(archivePath);
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
    let settled = false;
    const fail = (zip: ZipFile | undefined, error: unknown) => {
      if (settled) return;
      settled = true;
      zip?.close();
      reject(
        error instanceof VisibleDriveError
          ? error
          : new VisibleDriveError('DRIVE_DOWNLOAD_ARCHIVE_INVALID'),
      );
    };
    yauzl.open(archivePath, { autoClose: true, lazyEntries: true }, (openError, zip) => {
      if (openError !== null || zip === undefined) {
        fail(zip, openError);
        return;
      }
      zip.on('error', (error) => fail(zip, error));
      zip.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(outputs);
      });
      zip.on('entry', (entry: Entry) => {
        void handleArchiveEntry(zip, entry, input, outputs, totalBytes)
          .then((bytes) => {
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
): Promise<number> {
  if (/\/$/u.test(entry.fileName) || !isWorkbook(entry.fileName)) return totalBytes;
  if (entry.uncompressedSize < 1 || entry.uncompressedSize > input.maxFileSizeBytes) {
    throw new VisibleDriveError('DRIVE_DOWNLOAD_FILE_SIZE_INVALID');
  }
  const bytes = await readZipEntry(zip, entry, input.maxFileSizeBytes);
  const staged = await writeUniqueWorkbook(bytes, entry.fileName, input, outputs.length);
  outputs.push(staged);
  return totalBytes + bytes.byteLength;
}

async function readZipEntry(zip: ZipFile, entry: Entry, maxBytes: number): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error !== null || stream === undefined) {
        reject(new VisibleDriveError('DRIVE_DOWNLOAD_ARCHIVE_INVALID'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > maxBytes) {
          stream.destroy(new VisibleDriveError('DRIVE_DOWNLOAD_FILE_SIZE_INVALID'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}

async function stageWorkbookFile(
  source: string,
  sourceName: string,
  input: z.infer<typeof VisibleDriveInputSchema>,
  index: number,
): Promise<{ readonly hash: string; readonly name: string }> {
  const metadata = await lstat(source);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.size < 1 ||
    metadata.size > input.maxFileSizeBytes
  ) {
    throw new VisibleDriveError('DRIVE_DOWNLOAD_FILE_SIZE_INVALID');
  }
  const bytes = await readFile(source);
  return await writeUniqueWorkbook(bytes, sourceName, input, index);
}

async function writeUniqueWorkbook(
  bytes: Uint8Array,
  sourceName: string,
  input: z.infer<typeof VisibleDriveInputSchema>,
  index: number,
): Promise<{ readonly hash: string; readonly name: string }> {
  const safeName = safeWorkbookName(sourceName, index);
  const hash = createHash('sha256').update(bytes).digest('hex');
  let outputName = safeName;
  let suffix = 2;
  while (true) {
    const target = join(input.workDirectory, outputName);
    try {
      await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
      return { hash, name: outputName };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readFile(target);
      if (createHash('sha256').update(existing).digest('hex') === hash) {
        return { hash, name: outputName };
      }
      const extension = extname(safeName);
      outputName = `${safeName.slice(0, -extension.length)}-${suffix}${extension}`;
      suffix += 1;
    }
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
  const stem = flattened.slice(0, -extension.length).trim().slice(0, 160);
  return `${stem || `workbook-${index + 1}`}${extension}`;
}

function isWorkbook(name: string): boolean {
  const extension = extname(name).toLowerCase();
  return extension === '.xls' || extension === '.xlsx';
}

function isSupportedDownload(name: string): boolean {
  return isWorkbook(name) || extname(name).toLowerCase() === '.zip';
}

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
          reject(new Error(`${error.message}\n${stderr}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
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
