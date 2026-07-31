/* global URL, process */

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, relative, resolve, sep } from 'node:path';

const packageRequire = createRequire(
  new URL('../packages/local-executor/package.json', import.meta.url),
);
const ExcelJS = packageRequire('exceljs');

const MAX_FILES = 2_000;
const MAX_ROWS_PER_SHEET = 500;
const MAX_COLUMNS_PER_SHEET = 100;

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing required ${name} argument.`);
  }
  return resolve(value);
}

async function listWorkbookPaths(root) {
  const paths = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const fullPath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.xlsx') {
        paths.push(fullPath);
        if (paths.length > MAX_FILES) {
          throw new Error(`Input contains more than ${MAX_FILES} workbooks.`);
        }
      }
    }
  }
  await visit(root);
  return paths;
}

function scalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return null;
  if ('formula' in value || 'sharedFormula' in value) {
    return scalar('result' in value ? value.result : null);
  }
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => scalar(part?.text) ?? '').join('');
  }
  if ('text' in value) return scalar(value.text);
  return null;
}

function cleanText(value) {
  return typeof value === 'string' ? value.replaceAll(/\s+/g, ' ').trim() : '';
}

function compactText(value) {
  return cleanText(value).replaceAll(/\s+/g, '');
}

function firstNumber(values, startColumn) {
  for (let column = startColumn; column < values.length; column += 1) {
    const value = values[column];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function adjacentText(values, startColumn) {
  for (let column = startColumn; column < Math.min(values.length, startColumn + 5); column += 1) {
    const value = cleanText(values[column]);
    if (value !== '') return value;
  }
  return '';
}

function afterLabel(rows, labelPattern) {
  for (const row of rows) {
    for (let column = 0; column < row.length; column += 1) {
      const text = cleanText(row[column]);
      if (!labelPattern.test(text)) continue;
      const inline = text.split(/[:：]/u).slice(1).join(':').trim();
      return inline || adjacentText(row, column + 1);
    }
  }
  return '';
}

function findPreparedDate(rows) {
  for (const row of rows) {
    for (const value of row) {
      const text = cleanText(value);
      const match = text.match(/制表日期\s*[:：]?\s*(.+)$/u);
      if (match?.[1]) return match[1].trim();
    }
  }
  return '';
}

function findTotalCost(rows) {
  for (const row of rows) {
    const labelColumn = row.findIndex((value) => /總成本/u.test(cleanText(value)));
    if (labelColumn !== -1) return firstNumber(row, labelColumn + 1);
  }
  return null;
}

function sourceCategory(relativePath) {
  const segments = relativePath.split(sep);
  const first = segments.length > 1 ? segments[0] : '根目錄';
  return first === '_root' ? '根目錄' : first;
}

function findMaterialHeader(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const texts = rows[rowIndex].map(compactText);
    const material = texts.findIndex((value) => value === '材質');
    const specification = texts.findIndex((value) => value.includes('規格'));
    const weight = texts.findIndex((value) => value === '重量');
    const unitPrice = texts.findIndex((value) => value === '單價');
    if (material !== -1 && specification !== -1 && weight !== -1 && unitPrice !== -1) {
      const amountColumns = texts
        .map((value, index) => (/金\s*額/u.test(value) ? index : -1))
        .filter((index) => index !== -1);
      const negotiatedColumns = texts
        .map((value, index) => (value === '議價' ? index : -1))
        .filter((index) => index !== -1);
      return {
        amount: amountColumns[0] ?? -1,
        final: negotiatedColumns.at(-1) ?? -1,
        material,
        processingAmount: amountColumns.at(-1) ?? -1,
        specification,
        unitPrice,
        weight,
        rowIndex,
      };
    }
  }
  return undefined;
}

function toNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function materialRows(rows, header) {
  if (header === undefined) return [];
  const output = [];
  for (
    let rowIndex = header.rowIndex + 1;
    rowIndex < Math.min(rows.length, header.rowIndex + 30);
    rowIndex += 1
  ) {
    const row = rows[rowIndex];
    if (row.some((value) => /間接材料/u.test(cleanText(value)))) break;
    const material = cleanText(row[header.material]);
    const specification = cleanText(row[header.specification]);
    const weight = toNumber(row[header.weight]);
    const unitPrice = toNumber(row[header.unitPrice]);
    const amount = header.amount === -1 ? null : toNumber(row[header.amount]);
    const processingAmount =
      header.processingAmount === -1 ? null : toNumber(row[header.processingAmount]);
    const finalCost = header.final === -1 ? null : toNumber(row[header.final]);
    if (
      material === '' &&
      specification === '' &&
      weight === null &&
      unitPrice === null &&
      amount === null &&
      processingAmount === null &&
      finalCost === null
    ) {
      continue;
    }
    output.push({
      amount,
      finalCost,
      material,
      processingAmount,
      rowNumber: rowIndex + 1,
      specification,
      unitPrice,
      weight,
    });
  }
  return output;
}

function worksheetRows(worksheet) {
  const rowCount = Math.min(worksheet.rowCount, MAX_ROWS_PER_SHEET);
  const columnCount = Math.min(worksheet.columnCount, MAX_COLUMNS_PER_SHEET);
  return Array.from({ length: rowCount }, (_, rowOffset) =>
    Array.from({ length: columnCount }, (_, columnOffset) =>
      scalar(worksheet.getRow(rowOffset + 1).getCell(columnOffset + 1).value),
    ),
  );
}

async function parseWorkbook(inputRoot, workbookPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath, {
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
  const relativePath = relative(inputRoot, workbookPath);
  const sheets = [];
  for (const worksheet of workbook.worksheets) {
    const rows = worksheetRows(worksheet);
    const header = findMaterialHeader(rows);
    const details = materialRows(rows, header);
    const totalCost = findTotalCost(rows);
    const productNumber = afterLabel(rows, /品號\s*[:：]?/u);
    const modelNumber = afterLabel(rows, /模號\s*[:：]?/u);
    const productName = afterLabel(rows, /品名\s*[:：]?/u);
    const containsQuote = rows.some((row) =>
      row.some((value) => /成\s*本\s*報\s*價\s*單/u.test(cleanText(value))),
    );
    sheets.push({
      category: sourceCategory(relativePath),
      containsQuote,
      detailCount: details.length,
      details,
      modelNumber,
      preparedDate: findPreparedDate(rows),
      productName,
      productNumber,
      relativePath,
      sheetName: worksheet.name,
      sourceFile: relativePath.split(sep).at(-1) ?? relativePath,
      totalCost,
    });
  }
  return sheets;
}

const inputRoot = argument('--input');
const outputPath = argument('--output');
if (!(await stat(inputRoot)).isDirectory()) throw new Error('Input path must be a directory.');
const workbookPaths = await listWorkbookPaths(inputRoot);
const summaries = [];
const failures = [];
for (const [index, workbookPath] of workbookPaths.entries()) {
  try {
    summaries.push(...(await parseWorkbook(inputRoot, workbookPath)));
  } catch (error) {
    failures.push({
      error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown parse error',
      relativePath: relative(inputRoot, workbookPath),
    });
  }
  if ((index + 1) % 50 === 0) {
    process.stderr.write(`Parsed ${index + 1}/${workbookPaths.length} workbooks.\n`);
  }
}
const detailRows = summaries.flatMap((summary) =>
  summary.details.map((detail) => ({
    ...detail,
    category: summary.category,
    modelNumber: summary.modelNumber,
    productName: summary.productName,
    productNumber: summary.productNumber,
    relativePath: summary.relativePath,
    sheetName: summary.sheetName,
    sourceFile: summary.sourceFile,
  })),
);
const result = {
  generatedAt: new Date().toISOString(),
  input: {
    failureCount: failures.length,
    sheetCount: summaries.length,
    workbookCount: workbookPaths.length,
  },
  failures,
  detailRows,
  summaries: summaries.map((summary) => {
    const publicSummary = { ...summary };
    delete publicSummary.details;
    return publicSummary;
  }),
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
process.stdout.write(
  `${JSON.stringify({ ...result.input, detailRowCount: detailRows.length, outputPath })}\n`,
);
