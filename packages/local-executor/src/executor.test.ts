import ExcelJS from 'exceljs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { LocalExecutorError } from './errors';
import { hashFile } from './hash';
import { ProcessingLedger } from './ledger';
import { readSpreadsheet } from './read';
import { deduplicateRows, filterRows, mapColumns, mergeTables } from './transform';
import { aggregateRows, sortRows, validateRows } from './transform';
import { SafeFolderWatcher } from './watcher';
import { writeSpreadsheetAtomic } from './write';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'aiws-excel-fixture-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function createFixtureWorkbook(filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet('Orders_A');
  first.addRow(['Order ID', 'Customer', 'Amount', 'Region']);
  first.addRow(['A-1001', 'Acme', 10, 'North']);
  first.addRow(['A-1002', 'Beta', 15, 'South']);
  first.addRow(['A-1001', 'Acme updated', { formula: '10*2', result: 20 }, 'North']);
  const second = workbook.addWorksheet('Orders_B');
  second.addRow(['Order ID', 'Customer', 'Amount', 'Region']);
  second.addRow(['B-2001', 'Delta', 25, 'North']);
  second.addRow(['B-2002', 'Echo', 5, 'West']);
  await workbook.xlsx.writeFile(filePath);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('local spreadsheet executor', () => {
  it('detects a table header below title rows without manual configuration', async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, 'shifted-header.xlsx');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Orders');
    sheet.addRow(['July order report']);
    sheet.addRow(['Generated for Operations']);
    sheet.addRow([]);
    sheet.addRow(['Order ID', 'Customer', 'Amount', 'Order date']);
    sheet.addRow(['A-1', 'Acme', 12, '2026-07-31']);
    sheet.addRow(['B-2', 'Beta', 20, '2026-07-31']);
    await workbook.xlsx.writeFile(sourcePath);

    const document = await readSpreadsheet(sourcePath, { headerMode: 'auto' });
    expect(document.sheets[0]).toMatchObject({
      columns: ['Order ID', 'Customer', 'Amount', 'Order date'],
      headerRow: 4,
    });
    expect(document.sheets[0]?.rows).toHaveLength(2);
  });

  it('reads a bounded fixture, transforms it, and creates a verified new workbook', async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, 'orders.xlsx');
    const outputPath = join(directory, 'combined.xlsx');
    await createFixtureWorkbook(sourcePath);
    const sourceHash = await hashFile(sourcePath);

    const document = await readSpreadsheet(sourcePath, {
      maxFileSizeBytes: 2_000_000,
      maxRows: 20,
      maxSheets: 3,
    });
    expect(document.source).toMatchObject({
      fileHash: sourceHash,
      format: 'xlsx',
      formulaCellCount: 1,
    });
    expect(document.sheets).toHaveLength(2);
    expect(document.sheets.flatMap((sheet) => sheet.rows)).toHaveLength(5);
    expect(JSON.stringify(document)).not.toContain('10*2');

    const merged = mergeTables(document.sheets);
    const mapped = mapColumns(merged, { 'Order ID': 'orderId' });
    const filtered = filterRows(
      mapped,
      [{ field: 'Amount', operator: 'greater_than_or_equal', value: 10 }],
      'all',
    );
    const deduplicated = deduplicateRows(filtered, ['orderId'], 'last');
    expect(deduplicated.rows).toHaveLength(3);
    expect(deduplicated.rows[0]).toMatchObject({
      Customer: 'Beta',
      orderId: 'A-1002',
    });

    const result = await writeSpreadsheetAtomic([deduplicated], {
      maxFileSizeBytes: 2_000_000,
      outputPath,
    });
    expect(result).toMatchObject({
      backupCreated: false,
      processedRowCount: 3,
      sheetCount: 1,
    });
    expect(result.fileHash).toHaveLength(64);
    expect(await hashFile(sourcePath)).toBe(sourceHash);

    const output = await readSpreadsheet(outputPath, { maxRows: 10, maxSheets: 2 });
    expect(output.sheets[0]?.rows).toHaveLength(3);
    await expect(
      writeSpreadsheetAtomic([deduplicated], { outputPath, overwrite: false }),
    ).rejects.toMatchObject({ code: 'FILE_OUTPUT_EXISTS' });
  });

  it('enforces format, row, sheet, overwrite, and backup controls', async () => {
    const directory = await temporaryDirectory();
    const fixturePath = join(directory, 'orders.xlsx');
    const outputPath = join(directory, 'report.xlsx');
    await createFixtureWorkbook(fixturePath);

    await expect(readSpreadsheet(join(directory, 'orders.xlsm'))).rejects.toMatchObject({
      code: 'FILE_FORMAT_UNSUPPORTED',
    });
    await expect(readSpreadsheet(fixturePath, { maxRows: 2 })).rejects.toMatchObject({
      code: 'FILE_LIMIT_EXCEEDED',
    });
    await expect(readSpreadsheet(fixturePath, { maxSheets: 1 })).rejects.toMatchObject({
      code: 'FILE_LIMIT_EXCEEDED',
    });
    await expect(readSpreadsheet(fixturePath, { maxUncompressedBytes: 100 })).rejects.toMatchObject(
      {
        code: 'FILE_LIMIT_EXCEEDED',
      },
    );

    const document = await readSpreadsheet(fixturePath);
    const merged = mergeTables(document.sheets);
    await writeSpreadsheetAtomic([merged], { outputPath });
    await expect(
      writeSpreadsheetAtomic([merged], { outputPath, overwrite: true }),
    ).rejects.toMatchObject({
      code: 'FILE_WRITE_FAILED',
    });
    const overwritten = await writeSpreadsheetAtomic(
      [{ ...merged, rows: merged.rows.slice(0, 2) }],
      {
        backupBeforeOverwrite: true,
        outputPath,
        overwrite: true,
      },
    );
    expect(overwritten.backupCreated).toBe(true);
    expect((await readdir(directory)).some((name) => name.includes('.backup'))).toBe(true);
  });

  it('handles CSV independently and neutralizes formula-like output cells', async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, 'input.csv');
    const outputPath = join(directory, 'safe.csv');
    await writeFile(sourcePath, 'Order ID,Value\nA-1,10\n', 'utf8');
    const document = await readSpreadsheet(sourcePath);
    expect(document.source.format).toBe('csv');
    expect(document.sheets[0]?.rows).toEqual([{ 'Order ID': 'A-1', Value: 10 }]);

    await writeSpreadsheetAtomic(
      [
        {
          columns: ['Order ID', 'Value'],
          name: 'CSV',
          rows: [{ 'Order ID': 'A-2', Value: '=SUM(1,2)' }],
        },
      ],
      { outputPath },
    );
    expect(await readFile(outputPath, 'utf8')).toContain(`'=SUM(1,2)`);
  });

  it('does not mistake values containing header substrings for a later header row', async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, 'status.csv');
    await writeFile(
      sourcePath,
      'Status,Amount,Private\nPaid,120,customer-1\nPending,80,customer-2\nPaid,200,customer-3\n',
      'utf8',
    );

    const document = await readSpreadsheet(sourcePath, { headerMode: 'auto' });

    expect(document.sheets[0]).toMatchObject({
      columns: ['Status', 'Amount', 'Private'],
      headerRow: 1,
    });
    expect(document.sheets[0]?.rows).toHaveLength(3);
  });

  it('sorts, aggregates, validates, and writes a styled report deterministically', async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, 'summary.xlsx');
    const source = {
      columns: ['Region', 'Amount', 'Order ID'],
      name: 'Orders',
      rows: [
        { Amount: 20, 'Order ID': 'B-2', Region: 'South' },
        { Amount: 10, 'Order ID': 'A-1', Region: 'North' },
        { Amount: null, 'Order ID': '', Region: 'North' },
      ],
    } as const;
    const validated = validateRows(source, [
      { field: 'Order ID', required: true },
      { dataType: 'number', field: 'Amount', required: true },
    ]);
    expect(validated.valid.rows).toHaveLength(2);
    expect(validated.invalid.rows[0]).toMatchObject({
      _validation_errors: 'Order ID:required,Amount:required',
    });
    const sorted = sortRows(validated.valid, [
      { direction: 'desc', field: 'Amount', nulls: 'last' },
    ]);
    expect(sorted.rows[0]?.Amount).toBe(20);
    const summary = aggregateRows(
      sorted,
      ['Region'],
      [
        { alias: 'Orders', operation: 'count' },
        { alias: 'Total', field: 'Amount', operation: 'sum' },
        { alias: 'Average', field: 'Amount', operation: 'average' },
      ],
    );
    expect(summary.rows).toEqual([
      { Average: 20, Orders: 1, Region: 'South', Total: 20 },
      { Average: 10, Orders: 1, Region: 'North', Total: 10 },
    ]);

    await writeSpreadsheetAtomic([summary], {
      outputPath,
      reportTitle: 'Daily order summary',
    });
    const report = new ExcelJS.Workbook();
    await report.xlsx.readFile(outputPath);
    expect(report.title).toBe('Daily order summary');
    expect(report.worksheets[0]?.views[0]?.state).toBe('frozen');
    expect(report.worksheets[0]?.autoFilter).toBeDefined();
  });

  it('persists successful input hashes and suppresses duplicate processing after restart', async () => {
    const directory = await temporaryDirectory();
    const ledgerPath = join(directory, 'processing-ledger.json');
    const inputHash = 'a'.repeat(64);
    const outputHash = 'b'.repeat(64);
    const first = new ProcessingLedger(ledgerPath);

    await expect(
      Promise.all([
        first.claim('workflow-v1', [inputHash]),
        first.claim('workflow-v1', [inputHash]),
      ]),
    ).resolves.toEqual(['claimed', 'in_progress']);
    await first.complete('workflow-v1', [inputHash], outputHash);

    const restarted = new ProcessingLedger(ledgerPath);
    await expect(restarted.claim('workflow-v1', [inputHash])).resolves.toBe('duplicate');
    expect(await readFile(ledgerPath, 'utf8')).not.toContain('workflow-v1');
  });

  it('watches approved-root files and suppresses unchanged content hashes', async () => {
    const directory = await temporaryDirectory();
    const events: string[] = [];
    let resolveFirst: (() => void) | undefined;
    const firstEvent = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const watcher = new SafeFolderWatcher({
      debounceMs: 100,
      onFile: (event) => {
        events.push(`${event.event}:${event.fileName}:${event.fileHash}`);
        resolveFirst?.();
      },
      pattern: '*.csv',
      rootPath: directory,
    });
    await watcher.start();
    try {
      const csvPath = join(directory, 'orders.csv');
      await writeFile(csvPath, 'Order ID,Amount\nA-1,10\n', 'utf8');
      await Promise.race([
        firstEvent,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Watcher fixture timed out.')), 5_000);
        }),
      ]);
      await writeFile(csvPath, 'Order ID,Amount\nA-1,10\n', 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatch(/^created:orders\.csv:[a-f0-9]{64}$/);
    } finally {
      await watcher.stop();
    }
  }, 10_000);

  it('returns structured local errors without exposing file paths', () => {
    const error = new LocalExecutorError('FILE_LIMIT_EXCEEDED', 'Safe message');
    expect(error).toMatchObject({
      code: 'FILE_LIMIT_EXCEEDED',
      message: 'Safe message',
      retryable: false,
    });
  });
});
