import ExcelJS from 'exceljs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { z } from 'zod';

import { LocalExecutorError } from './errors';
import { looksLikeSpreadsheetHeader } from './header-detection';
import { hashFile } from './hash';
import { readLegacyXls } from './legacy-xls';
import type {
  ResolvedSpreadsheetReadOptions,
  SpreadsheetCell,
  SpreadsheetDocument,
  SpreadsheetReadControl,
  SpreadsheetReadOptions,
  SpreadsheetRow,
  SpreadsheetTable,
} from './types';
import { inspectXlsxArchive } from './zip-safety';

const ReadOptionsSchema = z
  .object({
    headerMode: z.enum(['auto', 'fixed']).default('auto'),
    headerRow: z.number().int().min(1).max(100).default(1),
    headerScanRows: z.number().int().min(1).max(100).default(30),
    maxColumns: z.number().int().min(1).max(2_000).default(500),
    maxCompressionRatio: z.number().min(1).max(1_000).default(100),
    maxFileSizeBytes: z.number().int().min(1).max(200_000_000).default(50_000_000),
    maxRows: z.number().int().min(1).max(1_000_000).default(100_000),
    maxSheets: z.number().int().min(1).max(200).default(50),
    maxUncompressedBytes: z.number().int().min(1).max(1_000_000_000).default(250_000_000),
    sheetMode: z.enum(['all', 'named']).default('all'),
    sheetNames: z.array(z.string().trim().min(1).max(100)).min(1).max(50).optional(),
  })
  .strict()
  .superRefine((options, context) => {
    if (options.sheetMode === 'named' && options.sheetNames === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Named sheet mode requires sheet names.',
        path: ['sheetNames'],
      });
    }
    if (options.sheetMode === 'all' && options.sheetNames !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'All sheet mode must not include sheet names.',
        path: ['sheetNames'],
      });
    }
  });

interface CellConversionState {
  formulaCellCount: number;
}

function resolvedOptions(options: SpreadsheetReadOptions): ResolvedSpreadsheetReadOptions {
  const parsed = ReadOptionsSchema.parse(options);
  return {
    headerMode: parsed.headerMode,
    headerRow: parsed.headerRow,
    headerScanRows: parsed.headerScanRows,
    maxColumns: parsed.maxColumns,
    maxCompressionRatio: parsed.maxCompressionRatio,
    maxFileSizeBytes: parsed.maxFileSizeBytes,
    maxRows: parsed.maxRows,
    maxSheets: parsed.maxSheets,
    maxUncompressedBytes: parsed.maxUncompressedBytes,
    sheetMode: parsed.sheetMode,
    ...(parsed.sheetNames === undefined ? {} : { sheetNames: parsed.sheetNames }),
  };
}

function scalarCell(value: unknown, state: CellConversionState): SpreadsheetCell {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value !== 'object') {
    return null;
  }
  if ('formula' in value || 'sharedFormula' in value) {
    state.formulaCellCount += 1;
    return scalarCell('result' in value ? value.result : null, state);
  }
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText
      .map((part) =>
        typeof part === 'object' && part !== null && 'text' in part
          ? String(part.text).slice(0, 32_000)
          : '',
      )
      .join('')
      .slice(0, 32_000);
  }
  if ('text' in value && typeof value.text === 'string') {
    return value.text.slice(0, 32_000);
  }
  return null;
}

function uniqueHeaders(
  worksheet: ExcelJS.Worksheet,
  options: ResolvedSpreadsheetReadOptions,
  headerRow: number,
) {
  if (worksheet.columnCount > options.maxColumns) {
    throw new LocalExecutorError(
      'FILE_LIMIT_EXCEEDED',
      'The spreadsheet contains more columns than the configured limit.',
    );
  }
  const seen = new Map<string, number>();
  const headers: string[] = [];
  const state: CellConversionState = { formulaCellCount: 0 };
  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    const value = scalarCell(worksheet.getRow(headerRow).getCell(column).value, state);
    const base =
      String(value ?? '')
        .trim()
        .slice(0, 200) || `Column_${column}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    headers.push(count === 1 ? base : `${base}_${count}`);
  }
  return headers;
}

function headerCandidateScore(worksheet: ExcelJS.Worksheet, rowNumber: number): number {
  const state: CellConversionState = { formulaCellCount: 0 };
  const values = Array.from({ length: worksheet.columnCount }, (_, index) =>
    scalarCell(worksheet.getRow(rowNumber).getCell(index + 1).value, state),
  ).filter((value) => value !== null && String(value).trim() !== '');
  if (values.length < 2) return Number.NEGATIVE_INFINITY;

  const normalized = values.map((value) => String(value).trim().toLocaleLowerCase());
  const uniqueCount = new Set(normalized).size;
  const textCount = values.filter((value) => typeof value === 'string').length;
  const keywordCount = normalized.filter(looksLikeSpreadsheetHeader).length;
  const shortLabelCount = normalized.filter((value) => value.length <= 80).length;
  let followingDataRows = 0;
  for (
    let candidate = rowNumber + 1;
    candidate <= Math.min(worksheet.rowCount, rowNumber + 5);
    candidate += 1
  ) {
    let populated = 0;
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const value = scalarCell(worksheet.getRow(candidate).getCell(column).value, state);
      if (value !== null && String(value).trim() !== '') populated += 1;
    }
    if (populated >= Math.min(2, values.length)) followingDataRows += 1;
  }

  return (
    values.length * 4 +
    uniqueCount * 2 +
    textCount * 2 +
    keywordCount * 8 +
    shortLabelCount +
    followingDataRows * 3 -
    (values.length - uniqueCount) * 4 -
    rowNumber * 0.05
  );
}

function detectedHeaderRow(
  worksheet: ExcelJS.Worksheet,
  options: ResolvedSpreadsheetReadOptions,
): number {
  if (worksheet.columnCount > options.maxColumns) {
    throw new LocalExecutorError(
      'FILE_LIMIT_EXCEEDED',
      'The spreadsheet contains more columns than the configured limit.',
    );
  }
  if (options.headerMode === 'fixed') return options.headerRow;
  const lastCandidate = Math.min(
    worksheet.rowCount,
    options.headerScanRows,
    options.headerRow + options.headerScanRows - 1,
  );
  let bestRow = options.headerRow;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let rowNumber = options.headerRow; rowNumber <= lastCandidate; rowNumber += 1) {
    const score = headerCandidateScore(worksheet, rowNumber);
    if (score > bestScore) {
      bestRow = rowNumber;
      bestScore = score;
    }
  }
  return bestRow;
}

function worksheetToTable(
  worksheet: ExcelJS.Worksheet,
  options: ResolvedSpreadsheetReadOptions,
  state: CellConversionState,
): SpreadsheetTable {
  if (worksheet.rowCount > options.maxRows + options.headerRow + options.headerScanRows) {
    throw new LocalExecutorError(
      'FILE_LIMIT_EXCEEDED',
      'The spreadsheet contains rows beyond the configured processing limit.',
    );
  }
  const headerRow = detectedHeaderRow(worksheet, options);
  const columns = uniqueHeaders(worksheet, options, headerRow);
  const rows: SpreadsheetRow[] = [];
  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const excelRow = worksheet.getRow(rowNumber);
    const entries = columns.map(
      (column, columnIndex) =>
        [column, scalarCell(excelRow.getCell(columnIndex + 1).value, state)] as const,
    );
    if (entries.every(([, value]) => value === null || value === '')) {
      continue;
    }
    rows.push(Object.fromEntries(entries));
  }
  return {
    columns,
    headerRow,
    name: worksheet.name.slice(0, 100),
    rows,
  };
}

async function loadWorkbook(filePath: string, format: 'csv' | 'xlsx'): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    if (format === 'xlsx') {
      await workbook.xlsx.readFile(filePath, {
        ignoreNodes: [
          'dataValidations',
          'drawing',
          'extLst',
          'headerFooter',
          'hyperlinks',
          'legacyDrawing',
          'picture',
          'sheetProtection',
          'tableParts',
        ],
      });
    } else {
      await workbook.csv.readFile(filePath);
    }
  } catch (error) {
    throw new LocalExecutorError(
      'FILE_UNSAFE_CONTENT',
      'The spreadsheet could not be parsed safely.',
      { cause: error },
    );
  }
  return workbook;
}

export async function readSpreadsheet(
  filePath: string,
  inputOptions: SpreadsheetReadOptions = {},
  control: SpreadsheetReadControl = {},
): Promise<SpreadsheetDocument> {
  const options = resolvedOptions(inputOptions);
  const extension = extname(filePath).toLowerCase();
  const format =
    extension === '.xlsx'
      ? 'xlsx'
      : extension === '.xls'
        ? 'xls'
        : extension === '.csv'
          ? 'csv'
          : undefined;
  if (format === undefined) {
    throw new LocalExecutorError(
      'FILE_FORMAT_UNSUPPORTED',
      'Only .xls, .xlsx, and .csv spreadsheet inputs are supported.',
    );
  }

  let fileSizeBytes: number;
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new LocalExecutorError('FILE_NOT_FOUND', 'The local spreadsheet is not a file.');
    }
    fileSizeBytes = fileStat.size;
  } catch (error) {
    if (error instanceof LocalExecutorError) {
      throw error;
    }
    throw new LocalExecutorError('FILE_NOT_FOUND', 'The local spreadsheet was not found.', {
      cause: error,
      retryable: true,
    });
  }
  if (fileSizeBytes > options.maxFileSizeBytes) {
    throw new LocalExecutorError(
      'FILE_LIMIT_EXCEEDED',
      'The spreadsheet exceeds the configured file-size limit.',
    );
  }
  if (format === 'xlsx') {
    await inspectXlsxArchive(filePath, {
      maxCompressionRatio: options.maxCompressionRatio,
      maxEntries: 5_000,
      maxUncompressedBytes: options.maxUncompressedBytes,
    });
  }

  if (format === 'xls') {
    const [fileHash, legacy] = await Promise.all([
      hashFile(filePath),
      readLegacyXls(filePath, options, control),
    ]);
    return {
      sheets: legacy.sheets,
      source: {
        fileHash,
        fileSizeBytes,
        format,
        formulaCellCount: legacy.formulaCellCount,
      },
    };
  }

  const [fileHash, workbook] = await Promise.all([
    hashFile(filePath),
    loadWorkbook(filePath, format),
  ]);
  if (workbook.worksheets.length > options.maxSheets) {
    throw new LocalExecutorError(
      'FILE_LIMIT_EXCEEDED',
      'The workbook contains more sheets than the configured limit.',
    );
  }

  const selectedWorksheets =
    options.sheetMode === 'all'
      ? workbook.worksheets
      : (options.sheetNames ?? []).map((name) => {
          const worksheet = workbook.getWorksheet(name);
          if (worksheet === undefined) {
            throw new LocalExecutorError(
              'FILE_OUTPUT_INVALID',
              'A requested worksheet does not exist.',
            );
          }
          return worksheet;
        });
  const state: CellConversionState = { formulaCellCount: 0 };
  const sheets: SpreadsheetTable[] = [];
  let totalRows = 0;
  for (const worksheet of selectedWorksheets) {
    const sheet = worksheetToTable(worksheet, options, state);
    totalRows += sheet.rows.length;
    if (totalRows > options.maxRows) {
      throw new LocalExecutorError(
        'FILE_LIMIT_EXCEEDED',
        'The spreadsheet contains more rows than the configured limit.',
      );
    }
    sheets.push(sheet);
  }
  return {
    sheets,
    source: {
      fileHash,
      fileSizeBytes,
      format,
      formulaCellCount: state.formulaCellCount,
    },
  };
}
