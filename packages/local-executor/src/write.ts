import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { chmod, constants, copyFile, lstat, open, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import { LocalExecutorError } from './errors';
import { hashFile } from './hash';
import { readSpreadsheet } from './read';
import type {
  SpreadsheetCell,
  SpreadsheetTable,
  SpreadsheetWriteOptions,
  SpreadsheetWriteResult,
} from './types';

function safeSheetName(input: string, used: Set<string>): string {
  const base =
    input
      .replaceAll(/[\\/*?:[\]]/g, '_')
      .trim()
      .slice(0, 31) || 'Sheet';
  let candidate = base;
  let suffix = 1;
  while (used.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${base.slice(0, Math.max(1, 28 - String(suffix).length))}_${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function safeCsvCell(value: SpreadsheetCell): SpreadsheetCell {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function countRows(tables: readonly SpreadsheetTable[]): number {
  return tables.reduce((total, table) => total + table.rows.length, 0);
}

async function writeTemporary(
  temporaryPath: string,
  format: 'csv' | 'xlsx',
  tables: readonly SpreadsheetTable[],
  reportTitle?: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI Workflow Studio';
  workbook.created = new Date();
  if (reportTitle !== undefined) workbook.title = reportTitle.slice(0, 200);
  const usedNames = new Set<string>();
  for (const table of tables) {
    const worksheet = workbook.addWorksheet(safeSheetName(table.name, usedNames));
    worksheet.addRow(table.columns);
    for (const row of table.rows) {
      worksheet.addRow(
        table.columns.map((column) => {
          const value = row[column] ?? null;
          return format === 'csv' ? safeCsvCell(value) : value;
        }),
      );
    }
    if (format === 'xlsx' && table.columns.length > 0) {
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.autoFilter = {
        from: { column: 1, row: 1 },
        to: { column: table.columns.length, row: 1 },
      };
      const header = worksheet.getRow(1);
      header.height = 24;
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { pattern: 'solid', type: 'pattern', fgColor: { argb: 'FF111827' } };
      header.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let column = 1; column <= table.columns.length; column += 1) {
        const observed = table.rows
          .slice(0, 200)
          .map((row) => String(row[table.columns[column - 1] ?? ''] ?? '').length);
        worksheet.getColumn(column).width = Math.min(
          42,
          Math.max(12, table.columns[column - 1]?.length ?? 0, ...observed) + 2,
        );
      }
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        if (rowNumber % 2 === 0) {
          worksheet.getRow(rowNumber).fill = {
            pattern: 'solid',
            type: 'pattern',
            fgColor: { argb: 'FFF8FAFC' },
          };
        }
      }
    }
  }
  if (workbook.worksheets.length === 0) {
    workbook.addWorksheet('Sheet');
  }
  try {
    if (format === 'xlsx') {
      await workbook.xlsx.writeFile(temporaryPath);
    } else {
      const sheetName = workbook.worksheets[0]?.name;
      if (sheetName === undefined) {
        throw new LocalExecutorError(
          'FILE_OUTPUT_INVALID',
          'The CSV output has no worksheet to write.',
        );
      }
      await workbook.csv.writeFile(temporaryPath, {
        sheetName,
      });
    }
  } catch (error) {
    throw new LocalExecutorError(
      'FILE_WRITE_FAILED',
      'The spreadsheet output could not be written.',
      {
        cause: error,
        retryable: true,
      },
    );
  }
}

async function verifyTemporary(
  temporaryPath: string,
  expectedRows: number,
  expectedSheets: number,
  options: SpreadsheetWriteOptions,
): Promise<{ readonly fileHash: string; readonly fileSizeBytes: number }> {
  const verified = await readSpreadsheet(temporaryPath, {
    maxFileSizeBytes: options.maxFileSizeBytes ?? 50_000_000,
    maxRows: options.maxRows ?? 100_000,
    maxSheets: options.maxSheets ?? 50,
  });
  const actualRows = countRows(verified.sheets);
  const actualSheets = verified.sheets.length;
  if (actualRows !== expectedRows || actualSheets !== expectedSheets) {
    throw new LocalExecutorError(
      'FILE_OUTPUT_INVALID',
      'The temporary spreadsheet did not pass output verification.',
    );
  }
  return {
    fileHash: verified.source.fileHash,
    fileSizeBytes: verified.source.fileSizeBytes,
  };
}

export async function writeSpreadsheetAtomic(
  tables: readonly SpreadsheetTable[],
  options: SpreadsheetWriteOptions,
): Promise<SpreadsheetWriteResult> {
  const extension = extname(options.outputPath).toLowerCase();
  const format = extension === '.xlsx' ? 'xlsx' : extension === '.csv' ? 'csv' : undefined;
  if (format === undefined) {
    throw new LocalExecutorError(
      'FILE_FORMAT_UNSUPPORTED',
      'Only .xlsx and .csv spreadsheet outputs are supported.',
    );
  }
  if (format === 'csv' && tables.length > 1) {
    throw new LocalExecutorError(
      'FILE_OUTPUT_INVALID',
      'CSV output supports exactly one table; merge tables before writing.',
    );
  }
  const maxRows = options.maxRows ?? 100_000;
  const maxSheets = options.maxSheets ?? 50;
  const processedRowCount = countRows(tables);
  if (processedRowCount > maxRows || tables.length > maxSheets) {
    throw new LocalExecutorError(
      'FILE_LIMIT_EXCEEDED',
      'The spreadsheet output exceeds the configured row or sheet limit.',
    );
  }
  const overwrite = options.overwrite ?? false;
  if (overwrite && options.backupBeforeOverwrite !== true) {
    throw new LocalExecutorError(
      'FILE_WRITE_FAILED',
      'Overwriting a spreadsheet requires an explicit backup.',
    );
  }

  const parentStat = await stat(dirname(options.outputPath)).catch((error: unknown) => {
    throw new LocalExecutorError(
      'FILE_WRITE_FAILED',
      'The spreadsheet output directory does not exist.',
      { cause: error },
    );
  });
  if (!parentStat.isDirectory()) {
    throw new LocalExecutorError(
      'FILE_WRITE_FAILED',
      'The spreadsheet output parent is not a directory.',
    );
  }
  const destinationExists = await pathExists(options.outputPath);
  if (destinationExists) {
    const destinationStat = await lstat(options.outputPath);
    if (destinationStat.isSymbolicLink()) {
      throw new LocalExecutorError(
        'FILE_UNSAFE_CONTENT',
        'A spreadsheet output cannot replace a symbolic link.',
      );
    }
    if (!overwrite) {
      throw new LocalExecutorError(
        'FILE_OUTPUT_EXISTS',
        'The spreadsheet output already exists and overwrite is disabled.',
      );
    }
  }

  const temporaryPath = join(
    dirname(options.outputPath),
    `.${basename(options.outputPath)}.${randomUUID()}.tmp${extension}`,
  );
  const lockPath = `${options.outputPath}.aiws.lock`;
  let backupCreated = false;
  let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    lockHandle = await open(lockPath, 'wx', 0o600);
    await writeTemporary(temporaryPath, format, tables, options.reportTitle);
    await chmod(temporaryPath, 0o600);
    const temporaryHandle = await open(temporaryPath, 'r');
    try {
      await temporaryHandle.sync();
    } finally {
      await temporaryHandle.close();
    }
    const verified = await verifyTemporary(
      temporaryPath,
      processedRowCount,
      format === 'csv' ? 1 : Math.max(1, tables.length),
      options,
    );
    if (destinationExists) {
      const backupPath = `${options.outputPath}.${Date.now()}.${randomUUID()}.backup`;
      const originalHash = await hashFile(options.outputPath);
      await copyFile(options.outputPath, backupPath, constants.COPYFILE_EXCL);
      if ((await hashFile(backupPath)) !== originalHash) {
        throw new LocalExecutorError(
          'FILE_OUTPUT_INVALID',
          'The overwrite backup failed hash verification.',
        );
      }
      backupCreated = true;
    } else if (await pathExists(options.outputPath)) {
      throw new LocalExecutorError(
        'FILE_OUTPUT_EXISTS',
        'The spreadsheet output appeared while the operation was in progress.',
      );
    }
    await rename(temporaryPath, options.outputPath);
    const [finalHash, finalStat] = await Promise.all([
      hashFile(options.outputPath),
      stat(options.outputPath),
    ]);
    if (finalHash !== verified.fileHash) {
      throw new LocalExecutorError(
        'FILE_OUTPUT_INVALID',
        'The final spreadsheet hash does not match the verified temporary output.',
      );
    }
    return {
      backupCreated,
      fileHash: finalHash,
      fileSizeBytes: finalStat.size,
      processedRowCount,
      sheetCount: format === 'csv' ? 1 : Math.max(1, tables.length),
    };
  } catch (error) {
    if (error instanceof LocalExecutorError) {
      throw error;
    }
    throw new LocalExecutorError('FILE_WRITE_FAILED', 'The spreadsheet output failed safely.', {
      cause: error,
      retryable: true,
    });
  } finally {
    if (lockHandle !== undefined) {
      await lockHandle.close().catch(() => undefined);
      await unlink(lockPath).catch(() => undefined);
    }
    await unlink(temporaryPath).catch(() => undefined);
  }
}
