import ExcelJS from 'exceljs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { combineXlsxWorkbooksAsTabs } from './combine-workbooks';
import { LocalExecutorError } from './errors';

const temporaryDirectories: string[] = [];

// Smallest valid 1x1 transparent PNG.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'aiws-combine-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeStyledWorkbook(
  filePath: string,
  options: { readonly withImage?: boolean } = {},
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Quote');
  sheet.getColumn(1).width = 42;
  const titleCell = sheet.getCell('A1');
  titleCell.value = '配件組成表';
  titleCell.font = { bold: true, size: 16 };
  titleCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  sheet.mergeCells('A1:C1');
  sheet.getCell('A2').value = 'SPCC';
  sheet.getCell('B2').value = 22;
  if (options.withImage === true) {
    const imageId = workbook.addImage({
      buffer: PNG_1X1 as unknown as ExcelJS.Buffer,
      extension: 'png',
    });
    sheet.addImage(imageId, 'E2:F6');
  }
  await workbook.xlsx.writeFile(filePath);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('combineXlsxWorkbooksAsTabs', () => {
  it('combines each workbook into its own tab named after the file, preserving formatting', async () => {
    const directory = await temporaryDirectory();
    const first = join(directory, '2592.xlsx');
    const second = join(directory, '合陞成本報價.xlsx');
    const output = join(directory, 'merged.xlsx');
    await writeStyledWorkbook(first, { withImage: true });
    await writeStyledWorkbook(second);

    const result = await combineXlsxWorkbooksAsTabs([first, second], output);

    expect(result.sheetCount).toBe(2);
    expect(result.imageCount).toBe(1);
    expect(result.skipped).toEqual([]);

    const merged = new ExcelJS.Workbook();
    await merged.xlsx.readFile(output);
    expect(merged.worksheets.map((sheet) => sheet.name)).toEqual(['2592', '合陞成本報價']);

    const firstSheet = merged.getWorksheet('2592');
    if (firstSheet === undefined) throw new Error('missing first sheet');
    const title = firstSheet.getCell('A1');
    expect(title.value).toBe('配件組成表');
    expect(title.font?.bold).toBe(true);
    expect(title.border?.top?.style).toBe('thin');
    expect(firstSheet.getColumn(1).width).toBe(42);
    expect(firstSheet.model.merges).toContain('A1:C1');
    expect(firstSheet.getImages()).toHaveLength(1);
  });

  it('disambiguates duplicate file names with a numeric suffix', async () => {
    const directory = await temporaryDirectory();
    await mkdir(join(directory, 'a'));
    await mkdir(join(directory, 'b'));
    const a = join(directory, 'a', 'report.xlsx');
    const b = join(directory, 'b', 'report.xlsx');
    await writeStyledWorkbook(a);
    await writeStyledWorkbook(b);
    const output = join(directory, 'merged.xlsx');

    const result = await combineXlsxWorkbooksAsTabs([a, b], output);

    expect(result.sheetCount).toBe(2);
    const merged = new ExcelJS.Workbook();
    await merged.xlsx.readFile(output);
    expect(merged.worksheets.map((sheet) => sheet.name)).toEqual(['report', 'report(2)']);
  });

  it('throws WORKBOOK_COMBINE_FAILED when no workbook can be read', async () => {
    const directory = await temporaryDirectory();
    const output = join(directory, 'merged.xlsx');
    await expect(
      combineXlsxWorkbooksAsTabs([join(directory, 'missing.xlsx')], output),
    ).rejects.toBeInstanceOf(LocalExecutorError);
  });
});
