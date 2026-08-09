import ExcelJS from 'exceljs';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

import { LocalExecutorError } from './errors';

/**
 * Combine many source workbooks into a single `.xlsx` where each source file
 * becomes its own tab, preserving cell values, styles, column widths, row
 * heights, merged cells, and embedded images.
 *
 * Legacy `.xls` sources are first converted to `.xlsx` with LibreOffice so
 * their full formatting survives; SheetJS (the reader used elsewhere) only
 * exposes cell values, which is why a dedicated engine is required here.
 */
export interface CombineWorkbooksOptions {
  /** Absolute path to the LibreOffice `soffice` binary (bundled or system). */
  readonly sofficePath: string;
  /** Source `.xls`/`.xlsx` files, in the order they should become tabs. */
  readonly inputPaths: readonly string[];
  /** Destination `.xlsx` path (must not already exist). */
  readonly outputPath: string;
  /** Hard cap on source files. */
  readonly maxFiles?: number;
  /** Per-conversion-batch timeout in milliseconds. */
  readonly conversionTimeoutMs?: number;
  /** Cooperative cancellation. */
  readonly signal?: AbortSignal;
}

export interface CombineWorkbooksResult {
  readonly imageCount: number;
  readonly sheetCount: number;
  readonly skipped: readonly string[];
}

const DEFAULT_MAX_FILES = 500;
const DEFAULT_CONVERSION_TIMEOUT_MS = 600_000;
const SUPPORTED_EXTENSIONS = new Set(['.xls', '.xlsx']);

function uniqueSheetName(rawName: string, used: Set<string>): string {
  const cleaned =
    rawName
      .replaceAll(/[\\/*?:[\]]/g, '_')
      .trim()
      .slice(0, 31) || 'Sheet';
  let candidate = cleaned;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const tag = `(${suffix})`;
    candidate = `${cleaned.slice(0, 31 - tag.length)}${tag}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

async function convertLegacyToXlsx(
  sofficePath: string,
  legacyPaths: readonly string[],
  outputDirectory: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (legacyPaths.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      sofficePath,
      [
        '--headless',
        '--invisible',
        '--nodefault',
        '--norestore',
        '--nologo',
        '--nofirststartwizard',
        '--convert-to',
        'xlsx',
        '--outdir',
        outputDirectory,
        ...legacyPaths,
      ],
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (error) => {
        if (error === null) resolve();
        else
          reject(
            new LocalExecutorError(
              'WORKBOOK_CONVERSION_FAILED',
              'LibreOffice could not convert one or more legacy workbooks.',
              { cause: error, retryable: true },
            ),
          );
      },
    );
    if (signal !== undefined) {
      if (signal.aborted) {
        child.kill('SIGKILL');
        reject(
          new LocalExecutorError('WORKBOOK_CONVERSION_FAILED', 'Workbook conversion was aborted.', {
            retryable: true,
          }),
        );
        return;
      }
      signal.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });
    }
  });
}

function copyWorksheet(source: ExcelJS.Worksheet, target: ExcelJS.Worksheet): void {
  if (Array.isArray(source.columns)) {
    target.columns = source.columns.map((column) => {
      const partial: Partial<ExcelJS.Column> = {};
      if (typeof column.width === 'number') partial.width = column.width;
      if (typeof column.hidden === 'boolean') partial.hidden = column.hidden;
      return partial;
    });
  }
  source.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const targetRow = target.getRow(rowNumber);
    if (typeof row.height === 'number') targetRow.height = row.height;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const targetCell = targetRow.getCell(columnNumber);
      targetCell.value = cell.value;
      targetCell.style = cell.style;
    });
    targetRow.commit();
  });
  const merges = source.model.merges ?? [];
  for (const range of merges) {
    try {
      target.mergeCells(range);
    } catch {
      // Overlapping or duplicate ranges are ignored; the cell copy above wins.
    }
  }
}

function copyImages(
  sourceWorkbook: ExcelJS.Workbook,
  source: ExcelJS.Worksheet,
  targetWorkbook: ExcelJS.Workbook,
  target: ExcelJS.Worksheet,
): number {
  if (typeof source.getImages !== 'function') return 0;
  let copied = 0;
  for (const image of source.getImages()) {
    try {
      const media = sourceWorkbook.getImage(Number(image.imageId));
      if (media?.buffer === undefined) continue;
      const newImageId = targetWorkbook.addImage({
        buffer: media.buffer as ExcelJS.Buffer,
        extension: media.extension as 'jpeg' | 'png' | 'gif',
      });
      target.addImage(newImageId, image.range);
      copied += 1;
    } catch {
      // A single unreadable image must not abort the whole combine.
    }
  }
  return copied;
}

/**
 * Merge already-`.xlsx` workbooks into one multi-tab workbook. Exposed
 * separately so it can be unit-tested without LibreOffice installed.
 */
export async function combineXlsxWorkbooksAsTabs(
  xlsxPaths: readonly string[],
  outputPath: string,
): Promise<CombineWorkbooksResult> {
  const master = new ExcelJS.Workbook();
  const usedNames = new Set<string>();
  const skipped: string[] = [];
  let imageCount = 0;
  let sheetCount = 0;

  for (const path of xlsxPaths) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(path);
      const sourceSheet = workbook.worksheets[0];
      if (sourceSheet === undefined) {
        skipped.push(basename(path));
        continue;
      }
      const tabName = uniqueSheetName(basename(path, extname(path)), usedNames);
      const targetSheet = master.addWorksheet(tabName, { views: sourceSheet.views });
      copyWorksheet(sourceSheet, targetSheet);
      imageCount += copyImages(workbook, sourceSheet, master, targetSheet);
      sheetCount += 1;
    } catch {
      skipped.push(basename(path));
    }
  }

  if (sheetCount === 0) {
    throw new LocalExecutorError(
      'WORKBOOK_COMBINE_FAILED',
      'No source workbook could be combined.',
    );
  }
  await master.xlsx.writeFile(outputPath);
  return { imageCount, sheetCount, skipped };
}

/**
 * Full pipeline: convert legacy `.xls` sources with LibreOffice, then combine
 * every source into one formatting-preserving multi-tab `.xlsx`.
 */
export async function combineWorkbooksAsTabs(
  options: CombineWorkbooksOptions,
): Promise<CombineWorkbooksResult> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const timeoutMs = options.conversionTimeoutMs ?? DEFAULT_CONVERSION_TIMEOUT_MS;

  if (options.inputPaths.length === 0) {
    throw new LocalExecutorError('WORKBOOK_COMBINE_FAILED', 'No source workbooks were provided.');
  }
  if (options.inputPaths.length > maxFiles) {
    throw new LocalExecutorError(
      'FILE_LIMIT_EXCEEDED',
      `The combine request exceeds the ${maxFiles}-workbook limit.`,
    );
  }
  for (const path of options.inputPaths) {
    if (!SUPPORTED_EXTENSIONS.has(extname(path).toLowerCase())) {
      throw new LocalExecutorError(
        'FILE_FORMAT_UNSUPPORTED',
        'Only .xls and .xlsx workbooks can be combined.',
      );
    }
  }

  const legacyPaths = options.inputPaths.filter((path) => extname(path).toLowerCase() === '.xls');
  const workDirectory = await mkdtemp(join(tmpdir(), 'aiws-combine-'));
  try {
    await convertLegacyToXlsx(
      options.sofficePath,
      legacyPaths,
      workDirectory,
      timeoutMs,
      options.signal,
    );
    const convertedEntries = new Set(await readdir(workDirectory));
    const orderedXlsx = options.inputPaths.map((path) => {
      if (extname(path).toLowerCase() === '.xlsx') return path;
      const convertedName = `${basename(path, extname(path))}.xlsx`;
      if (!convertedEntries.has(convertedName)) {
        throw new LocalExecutorError(
          'WORKBOOK_CONVERSION_FAILED',
          'A legacy workbook was not converted before combining.',
          { retryable: true },
        );
      }
      return join(workDirectory, convertedName);
    });
    return await combineXlsxWorkbooksAsTabs(orderedXlsx, options.outputPath);
  } finally {
    await rm(workDirectory, { force: true, recursive: true });
  }
}
