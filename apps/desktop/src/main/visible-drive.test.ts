import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertNoActiveBaselinePartial,
  MACOS_DRIVE_SAVE_DIALOG_SCRIPT,
  MACOS_VISIBLE_DRIVE_SCRIPT,
  shouldRecordDialogMonitorFailure,
  stageDownloadedWorkbooks,
  snapshotDownloadDirectory,
  VisibleDriveError,
  waitForCompletedDownloads,
} from './visible-drive';

const temporaryDirectories: string[] = [];

interface ZipEntryFixture {
  readonly bytes: Buffer;
  readonly encrypted?: boolean;
  readonly name: string;
  readonly unixMode?: number;
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function zipFixture(entries: readonly ZipEntryFixture[], compress = false): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = compress ? deflateRawSync(entry.bytes) : entry.bytes;
    const method = compress ? 8 : 0;
    const flags = entry.encrypted === true ? 1 : 0;
    const checksum = crc32(entry.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.byteLength, 18);
    local.writeUInt32LE(entry.bytes.byteLength, 22);
    local.writeUInt16LE(name.byteLength, 26);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.byteLength, 20);
    central.writeUInt32LE(entry.bytes.byteLength, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt32LE(((entry.unixMode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.byteLength + name.byteLength + content.byteLength;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function stageInput(downloadDirectory: string, workDirectory: string, maxFiles = 10) {
  return {
    downloadDirectory,
    downloadTimeoutSeconds: 30,
    folderId: '1DriveFolderVisibleDownload123',
    maxFileSizeBytes: 5_000_000,
    maxFiles,
    workDirectory,
    workRelativePath: '.ai-workflow-studio/jobs/test',
  } as const;
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'aiws-visible-drive-'));
  temporaryDirectories.push(directory);
  return await realpath(directory);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('visible Drive download tracking', () => {
  it('selects items with dispatched mouse events and a shift-click range, not screen coordinates', () => {
    const selectionStart = MACOS_VISIBLE_DRIVE_SCRIPT.indexOf(
      'if semanticAction is "select_items" then',
    );
    const selectionEnd = MACOS_VISIBLE_DRIVE_SCRIPT.indexOf(
      'if semanticAction is "download_items" then',
    );
    const selectionBlock = MACOS_VISIBLE_DRIVE_SCRIPT.slice(selectionStart, selectionEnd);
    const dispatchFirst = selectionBlock.indexOf('fire(cells[0],{})');
    const shiftRange = selectionBlock.indexOf('shiftKey:true', dispatchFirst);
    const verifySelection = selectionBlock.indexOf('aria-selected', shiftRange);

    expect(selectionStart).toBeGreaterThanOrEqual(0);
    expect(selectionEnd).toBeGreaterThan(selectionStart);
    // Selection now happens by dispatching real MouseEvents on the DOM items,
    // which cannot miss the way absolute screen-coordinate clicks did.
    expect(selectionBlock).toContain('new MouseEvent(t,o)');
    expect(dispatchFirst).toBeGreaterThanOrEqual(0);
    expect(shiftRange).toBeGreaterThan(dispatchFirst);
    expect(verifySelection).toBeGreaterThan(shiftRange);
    expect(selectionBlock).not.toContain('click at {clickX, clickY}');
    expect(selectionBlock).not.toContain('key code 0 using {command down}');
  });

  it('triggers Download by dispatching a click on the button element, not a screen coordinate', () => {
    const downloadStart = MACOS_VISIBLE_DRIVE_SCRIPT.indexOf(
      'if semanticAction is "download_items" then',
    );
    const downloadEnd = MACOS_VISIBLE_DRIVE_SCRIPT.indexOf(
      'error "Unsupported visible Drive action."',
    );
    const downloadBlock = MACOS_VISIBLE_DRIVE_SCRIPT.slice(downloadStart, downloadEnd);
    const locateButton = downloadBlock.indexOf("l==='下載'||l==='Download'");
    const dispatchClick = downloadBlock.indexOf(
      'b.dispatchEvent(new MouseEvent(t,o))',
      locateButton,
    );
    const dialogCheck = downloadBlock.indexOf('set dialogState to execute', dispatchClick);

    expect(downloadStart).toBeGreaterThanOrEqual(0);
    expect(downloadEnd).toBeGreaterThan(downloadStart);
    expect(locateButton).toBeGreaterThanOrEqual(0);
    expect(dispatchClick).toBeGreaterThan(locateButton);
    expect(dialogCheck).toBeGreaterThan(dispatchClick);
    // No coordinate clicking and no synthetic keystrokes remain in the download path.
    expect(downloadBlock).not.toContain('click at {clickX, clickY}');
    expect(downloadBlock).not.toContain('key code 53');
  });

  it('keeps the validated Chrome window ID as text without weakening front-window trust', () => {
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain(
      'set trustedWindowId to id of front window as text',
    );
    expect(MACOS_VISIBLE_DRIVE_SCRIPT).toContain(
      'if (id of front window as text) is not trustedWindowId then error "The approved Chrome window changed during Download."',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'set trustedWindowId to item 2 of argv as text',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).not.toContain(
      'set trustedWindowId to item 2 of argv as integer',
    );
    expect(
      MACOS_DRIVE_SAVE_DIALOG_SCRIPT.match(
        /\(id of front window as text\) is not trustedWindowId/gu,
      ),
    ).toHaveLength(3);
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      "location.origin==='https://drive.google.com'&&location.pathname==='/drive/folders/",
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'if (count of sheets of front window) is not 1 then error "The Chrome Save sheet is not attached to the approved Drive window."',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain('set saveSheet to sheet 1 of front window');
  });

  it('tolerates an absent Save-sheet AXSubrole without weakening the dialog allowlist', () => {
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain('set saveSheetSubrole to "AXUnknown"');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'set observedSaveSheetSubrole to value of attribute "AXSubrole" of saveSheet',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain('on error errorMessage number errorNumber');
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'if observedSaveSheetSubrole is not missing value then set saveSheetSubrole to observedSaveSheetSubrole as text',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'if errorNumber is not -1728 then error errorMessage number errorNumber',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'if saveSheetRole is not "AXSheet" then error "The Chrome Save sheet role is invalid."',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'if saveSheetSubrole is not "AXDialog" and saveSheetSubrole is not "AXSystemDialog" and saveSheetSubrole is not "AXStandardWindow" and saveSheetSubrole is not "AXUnknown" then error "The Chrome Save sheet subrole is invalid."',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'if saveSheetIdentifier is not "save-panel" then error "The Chrome Save sheet identifier is invalid."',
    );
    expect(MACOS_DRIVE_SAVE_DIALOG_SCRIPT).toContain(
      'if (count of filenameFields) is not 1 or (count of saveButtons) is not 1 or (count of cancelButtons) is not 1 or (count of wherePopups) is not 1 then error "The Chrome sheet is not a unique Save dialog."',
    );
  });

  it('blocks a recently active baseline partial before click but allows an old stale partial', async () => {
    const directory = await temporaryDirectory();
    const stalePartial = join(directory, 'stale.zip.crdownload');
    const activePartial = join(directory, 'active.xlsx.crdownload');
    const now = Date.now();
    await writeFile(stalePartial, 'stale');
    await utimes(stalePartial, new Date(now - 120_000), new Date(now - 120_000));
    let baseline = await snapshotDownloadDirectory(directory);
    expect(() => assertNoActiveBaselinePartial(baseline, now)).not.toThrow();

    await writeFile(activePartial, 'active');
    baseline = await snapshotDownloadDirectory(directory);
    expect(() => assertNoActiveBaselinePartial(baseline, now)).toThrowError(
      expect.objectContaining({ code: 'DRIVE_DOWNLOAD_CONCURRENT_ACTIVITY' }),
    );
  });

  it('ignores unchanged files and a partial that already existed at the click baseline', async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, 'existing.xlsx'), 'existing');
    await writeFile(join(directory, 'stale.zip.crdownload'), 'stale partial');
    const baseline = await snapshotDownloadDirectory(directory);
    const startedAt = Date.now();

    await rename(join(directory, 'stale.zip.crdownload'), join(directory, 'stale.zip'));
    await writeFile(join(directory, 'current.xlsx'), 'current download');

    await expect(
      waitForCompletedDownloads(directory, baseline, startedAt, 500, new AbortController().signal, {
        pollIntervalMs: 5,
        stablePollsRequired: 1,
      }),
    ).resolves.toEqual([join(directory, 'current.xlsx')]);
  });

  it('fails closed when a complete baseline file changes instead of treating it as this download', async () => {
    const directory = await temporaryDirectory();
    const existing = join(directory, 'existing.xlsx');
    await writeFile(existing, 'before');
    const baseline = await snapshotDownloadDirectory(directory);
    const startedAt = Date.now();
    await writeFile(existing, 'changed after the click baseline');

    await expect(
      waitForCompletedDownloads(directory, baseline, startedAt, 200, new AbortController().signal, {
        pollIntervalMs: 5,
        stablePollsRequired: 1,
      }),
    ).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD_EXISTING_FILE_CHANGED' });
  });

  it('reports a new partial as incomplete without being blocked by stale partial names', async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, 'stale.xlsx.crdownload'), 'stale');
    const baseline = await snapshotDownloadDirectory(directory);
    const startedAt = Date.now();
    await writeFile(join(directory, 'current.zip.crdownload'), 'new partial');

    await expect(
      waitForCompletedDownloads(directory, baseline, startedAt, 30, new AbortController().signal, {
        pollIntervalMs: 5,
        stablePollsRequired: 1,
      }),
    ).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD_INCOMPLETE_TIMEOUT' });
  });

  it('reports that no download started when the approved directory has no new activity', async () => {
    const directory = await temporaryDirectory();
    const baseline = await snapshotDownloadDirectory(directory);

    await expect(
      waitForCompletedDownloads(directory, baseline, Date.now(), 30, new AbortController().signal, {
        pollIntervalMs: 5,
        stablePollsRequired: 1,
      }),
    ).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD_NOT_STARTED_OR_WRONG_LOCATION' });
  });

  it('locks a handled Save sheet to the unique filename prefix created for this run', async () => {
    const directory = await temporaryDirectory();
    const baseline = await snapshotDownloadDirectory(directory);
    const startedAt = Date.now();
    const prefix = `AIWS-${startedAt}-download`;
    await writeFile(join(directory, 'unrelated.xlsx'), 'unrelated');
    await writeFile(join(directory, `${prefix}approved.zip`), 'approved');

    await expect(
      waitForCompletedDownloads(directory, baseline, startedAt, 500, new AbortController().signal, {
        dialogFilePrefix: prefix,
        pollIntervalMs: 5,
        stablePollsRequired: 1,
        wasDialogHandled: () => true,
      }),
    ).resolves.toEqual([join(directory, `${prefix}approved.zip`)]);
  });

  it('accepts only one new ZIP for a multi-item selection and ignores unrelated workbooks', async () => {
    const directory = await temporaryDirectory();
    const baseline = await snapshotDownloadDirectory(directory);
    const startedAt = Date.now();
    await writeFile(join(directory, 'unrelated.xlsx'), 'unrelated');
    await writeFile(join(directory, 'selected-items.zip'), 'archive');

    await expect(
      waitForCompletedDownloads(directory, baseline, startedAt, 500, new AbortController().signal, {
        expectedSelectedCount: 2,
        pollIntervalMs: 5,
        stablePollsRequired: 1,
      }),
    ).resolves.toEqual([join(directory, 'selected-items.zip')]);
  });

  it('rejects multiple direct workbook candidates for a single selected item', async () => {
    const directory = await temporaryDirectory();
    const baseline = await snapshotDownloadDirectory(directory);
    const startedAt = Date.now();
    await writeFile(join(directory, 'first.xlsx'), 'first');
    await writeFile(join(directory, 'second.xls'), 'second');

    await expect(
      waitForCompletedDownloads(directory, baseline, startedAt, 500, new AbortController().signal, {
        expectedSelectedCount: 1,
        pollIntervalMs: 5,
        stablePollsRequired: 1,
      }),
    ).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD_AMBIGUOUS' });
  });

  it('treats internal watcher shutdown as success but preserves parent aborts and real failures', () => {
    expect(shouldRecordDialogMonitorFailure(true, false)).toBe(false);
    expect(shouldRecordDialogMonitorFailure(true, true)).toBe(true);
    expect(shouldRecordDialogMonitorFailure(false, false)).toBe(true);
  });

  it('propagates a classified Save dialog failure during download observation', async () => {
    const directory = await temporaryDirectory();
    const failure = new VisibleDriveError('DRIVE_DOWNLOAD_SAVE_LOCATION_FAILED');

    await expect(
      waitForCompletedDownloads(
        directory,
        new Map(),
        Date.now(),
        100,
        new AbortController().signal,
        { getDialogFailure: () => failure, pollIntervalMs: 5, stablePollsRequired: 1 },
      ),
    ).rejects.toBe(failure);
  });

  it('stops before writing staged output when the local user aborts', async () => {
    const root = await temporaryDirectory();
    const downloads = join(root, 'downloads');
    const work = join(downloads, 'work');
    await mkdir(downloads);
    await mkdir(work);
    const source = join(downloads, 'source.xlsx');
    await writeFile(source, Buffer.alloc(2_000_000, 1));
    const controller = new AbortController();
    controller.abort();

    await expect(
      stageDownloadedWorkbooks(stageInput(downloads, work), [source], controller.signal),
    ).rejects.toBeInstanceOf(VisibleDriveError);
    await expect(readdir(work)).resolves.toEqual([]);
  });

  it('rejects an oversized source before copying a snapshot', async () => {
    const root = await temporaryDirectory();
    const downloads = join(root, 'downloads');
    const work = join(downloads, 'work');
    await mkdir(downloads);
    await mkdir(work);
    const source = join(downloads, 'oversized.xlsx');
    await writeFile(source, Buffer.alloc(64));
    const input = { ...stageInput(downloads, work), maxFileSizeBytes: 32 };

    await expect(
      stageDownloadedWorkbooks(input, [source], new AbortController().signal),
    ).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD_FILE_SIZE_INVALID' });
    await expect(readdir(work)).resolves.toEqual([]);
  });

  it('does not write through a work-directory symlink swapped into the approved root', async () => {
    const root = await temporaryDirectory();
    const downloads = join(root, 'downloads');
    const outside = join(root, 'outside');
    const work = join(downloads, 'work');
    await mkdir(downloads);
    await mkdir(outside);
    await symlink(outside, work);
    const source = join(downloads, 'source.xlsx');
    await writeFile(source, 'source');

    await expect(
      stageDownloadedWorkbooks(stageInput(downloads, work), [source], new AbortController().signal),
    ).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD_DIRECTORY_NOT_AUTHORIZED' });
    await expect(readdir(outside)).resolves.toEqual([]);
  });

  it.each([
    {
      code: 'DRIVE_DOWNLOAD_ARCHIVE_INVALID',
      entry: { bytes: Buffer.from('x'), name: '../escape.xlsx' },
      label: 'path traversal',
    },
    {
      code: 'DRIVE_DOWNLOAD_ARCHIVE_INVALID',
      entry: { bytes: Buffer.from('target'), name: 'link.xlsx', unixMode: 0o120777 },
      label: 'symbolic link',
    },
    {
      code: 'DRIVE_DOWNLOAD_ARCHIVE_INVALID',
      entry: { bytes: Buffer.from('encrypted'), encrypted: true, name: 'encrypted.xlsx' },
      label: 'encryption',
    },
  ])('rejects ZIP $label entries before staging them', async ({ code, entry }) => {
    const root = await temporaryDirectory();
    const downloads = join(root, 'downloads');
    const work = join(downloads, 'work');
    await mkdir(downloads);
    await mkdir(work);
    const archive = join(downloads, 'source.zip');
    await writeFile(archive, zipFixture([entry]));

    await expect(
      stageDownloadedWorkbooks(
        stageInput(downloads, work),
        [archive],
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code });
    expect((await readdir(work)).filter((name) => name.endsWith('.xlsx'))).toEqual([]);
  });

  it('rejects a highly compressed ZIP entry before expansion', async () => {
    const root = await temporaryDirectory();
    const downloads = join(root, 'downloads');
    const work = join(downloads, 'work');
    await mkdir(downloads);
    await mkdir(work);
    const archive = join(downloads, 'source.zip');
    await writeFile(
      archive,
      zipFixture([{ bytes: Buffer.alloc(2_000_000), name: 'ratio.xlsx' }], true),
    );

    await expect(
      stageDownloadedWorkbooks(
        stageInput(downloads, work),
        [archive],
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD_ARCHIVE_LIMIT_EXCEEDED' });
    expect((await readdir(work)).filter((name) => name.endsWith('.xlsx'))).toEqual([]);
  });

  it('checks the workbook count before writing the entry beyond the approved limit', async () => {
    const root = await temporaryDirectory();
    const downloads = join(root, 'downloads');
    const work = join(downloads, 'work');
    await mkdir(downloads);
    await mkdir(work);
    const archive = join(downloads, 'source.zip');
    await writeFile(
      archive,
      zipFixture([
        { bytes: Buffer.from('first'), name: 'first.xlsx' },
        { bytes: Buffer.from('second'), name: 'second.xlsx' },
      ]),
    );

    await expect(
      stageDownloadedWorkbooks(
        stageInput(downloads, work, 1),
        [archive],
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD_ARCHIVE_LIMIT_EXCEEDED' });
    expect((await readdir(work)).filter((name) => name.endsWith('.xlsx'))).toHaveLength(1);
  });

  it('reuses the normalized visible-download name for an identical retry and suffixes changed bytes', async () => {
    const root = await temporaryDirectory();
    const downloads = join(root, 'downloads');
    const work = join(downloads, 'work');
    await mkdir(downloads);
    await mkdir(work);
    const source = join(downloads, 'AIWS-1770000000000-download.xlsx');
    await writeFile(source, 'same bytes');

    const first = await stageDownloadedWorkbooks(
      stageInput(downloads, work),
      [source],
      new AbortController().signal,
    );
    const retry = await stageDownloadedWorkbooks(
      stageInput(downloads, work),
      [source],
      new AbortController().signal,
    );
    expect(first.paths).toEqual(['.ai-workflow-studio/jobs/test/drive-download.xlsx']);
    expect(retry.paths).toEqual(first.paths);

    await writeFile(source, 'different bytes');
    const changed = await stageDownloadedWorkbooks(
      stageInput(downloads, work),
      [source],
      new AbortController().signal,
    );
    expect(changed.paths).toEqual(['.ai-workflow-studio/jobs/test/drive-download-2.xlsx']);
  });

  it('deduplicates identical direct retries even when Chrome adds a collision suffix', async () => {
    const root = await temporaryDirectory();
    const downloads = join(root, 'downloads');
    const work = join(downloads, 'work');
    await mkdir(downloads);
    await mkdir(work);
    const firstSource = join(downloads, 'report.xlsx');
    const retrySource = join(downloads, 'report (1).xlsx');
    await writeFile(firstSource, 'same bytes');
    await writeFile(retrySource, 'same bytes');

    const first = await stageDownloadedWorkbooks(
      stageInput(downloads, work),
      [firstSource],
      new AbortController().signal,
    );
    const retry = await stageDownloadedWorkbooks(
      stageInput(downloads, work),
      [retrySource],
      new AbortController().signal,
    );

    expect(first.paths).toEqual(['.ai-workflow-studio/jobs/test/drive-download.xlsx']);
    expect(retry.paths).toEqual(first.paths);
    expect((await readdir(work)).filter((name) => name.endsWith('.xlsx'))).toEqual([
      'drive-download.xlsx',
    ]);
  });

  it('keeps duplicate ZIP basenames distinct and caps staged names by UTF-8 bytes', async () => {
    const root = await temporaryDirectory();
    const downloads = join(root, 'downloads');
    const work = join(downloads, 'work');
    await mkdir(downloads);
    await mkdir(work);
    const archive = join(downloads, 'source.zip');
    const longName = `${'成本'.repeat(80)}.xlsx`;
    await writeFile(
      archive,
      zipFixture([
        { bytes: Buffer.from('same'), name: 'first/report.xlsx' },
        { bytes: Buffer.from('same'), name: 'second/report.xlsx' },
        { bytes: Buffer.from('long'), name: longName },
      ]),
    );

    const result = await stageDownloadedWorkbooks(
      stageInput(downloads, work),
      [archive],
      new AbortController().signal,
    );
    expect(result.paths.slice(0, 2)).toEqual([
      '.ai-workflow-studio/jobs/test/report.xlsx',
      '.ai-workflow-studio/jobs/test/report-2.xlsx',
    ]);
    expect(Buffer.byteLength(result.paths[2]?.split('/').at(-1) ?? '', 'utf8')).toBeLessThanOrEqual(
      220,
    );
  });

  it('suffixes case-only ZIP basename collisions as distinct macOS outputs', async () => {
    const root = await temporaryDirectory();
    const downloads = join(root, 'downloads');
    const work = join(downloads, 'work');
    await mkdir(downloads);
    await mkdir(work);
    const archive = join(downloads, 'source.zip');
    await writeFile(
      archive,
      zipFixture([
        { bytes: Buffer.from('same'), name: 'first/Report.xlsx' },
        { bytes: Buffer.from('same'), name: 'second/report.xlsx' },
      ]),
    );

    const result = await stageDownloadedWorkbooks(
      stageInput(downloads, work),
      [archive],
      new AbortController().signal,
    );

    expect(result.paths).toEqual([
      '.ai-workflow-studio/jobs/test/Report.xlsx',
      '.ai-workflow-studio/jobs/test/report-2.xlsx',
    ]);
    expect((await readdir(work)).filter((name) => name.endsWith('.xlsx'))).toHaveLength(2);
  });
});
