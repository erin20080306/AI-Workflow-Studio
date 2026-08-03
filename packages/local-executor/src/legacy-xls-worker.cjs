'use strict';
/* global Buffer, require */
/* eslint-disable @typescript-eslint/no-require-imports */

const { readFile } = require('node:fs/promises');
const { isAbsolute } = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');

const { looksLikeSpreadsheetHeader } = require('./header-detection.cjs');
const xlsx = require('xlsx');
const cptable = require('xlsx/dist/cpexcel');

const OLE_COMPOUND_FILE_SIGNATURE = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const ERROR_CODES = new Set([
  'FILE_LIMIT_EXCEEDED',
  'FILE_NOT_FOUND',
  'FILE_OUTPUT_INVALID',
  'FILE_UNSAFE_CONTENT',
]);

xlsx.set_cptable(cptable);

function fail(code, message, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  error.safeLegacyXlsError = true;
  throw error;
}

function workerInput(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet worker input is invalid.');
  }
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'filePath,options') {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet worker input is invalid.');
  }
  if (
    typeof value.filePath !== 'string' ||
    value.filePath.length < 1 ||
    value.filePath.length > 4_096 ||
    value.filePath.includes('\0') ||
    !isAbsolute(value.filePath)
  ) {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet worker path is invalid.');
  }
  return { filePath: value.filePath, options: readOptions(value.options) };
}

function readOptions(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet options are invalid.');
  }
  const expectedKeys = [
    'headerMode',
    'headerRow',
    'headerScanRows',
    'maxColumns',
    'maxCompressionRatio',
    'maxFileSizeBytes',
    'maxRows',
    'maxSheets',
    'maxUncompressedBytes',
    'sheetMode',
  ];
  if (value.sheetNames !== undefined) expectedKeys.push('sheetNames');
  if (Object.keys(value).sort().join(',') !== expectedKeys.sort().join(',')) {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet options are invalid.');
  }
  if (value.headerMode !== 'auto' && value.headerMode !== 'fixed') {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet options are invalid.');
  }
  if (value.sheetMode !== 'all' && value.sheetMode !== 'named') {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet options are invalid.');
  }
  const integerLimits = [
    ['headerRow', 1, 100],
    ['headerScanRows', 1, 100],
    ['maxColumns', 1, 2_000],
    ['maxFileSizeBytes', 1, 200_000_000],
    ['maxRows', 1, 1_000_000],
    ['maxSheets', 1, 200],
    ['maxUncompressedBytes', 1, 1_000_000_000],
  ];
  for (const [key, minimum, maximum] of integerLimits) {
    if (!Number.isInteger(value[key]) || value[key] < minimum || value[key] > maximum) {
      fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet options are invalid.');
    }
  }
  if (
    typeof value.maxCompressionRatio !== 'number' ||
    !Number.isFinite(value.maxCompressionRatio) ||
    value.maxCompressionRatio < 1 ||
    value.maxCompressionRatio > 1_000
  ) {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet options are invalid.');
  }
  if (value.sheetMode === 'named') {
    if (
      !Array.isArray(value.sheetNames) ||
      value.sheetNames.length < 1 ||
      value.sheetNames.length > 50 ||
      value.sheetNames.some(
        (name) => typeof name !== 'string' || name.trim().length < 1 || name.length > 100,
      )
    ) {
      fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet options are invalid.');
    }
  } else if (value.sheetNames !== undefined) {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet options are invalid.');
  }
  return value;
}

function workbookReadOptions() {
  return {
    bookDeps: false,
    bookFiles: false,
    bookProps: false,
    bookVBA: false,
    cellDates: true,
    cellFormula: true,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    cellText: false,
    dense: false,
    nodim: true,
    PRN: false,
    raw: true,
    type: 'buffer',
    WTF: false,
  };
}

function isOleCompoundWorkbook(buffer) {
  return (
    buffer.byteLength >= OLE_COMPOUND_FILE_SIGNATURE.byteLength &&
    buffer.subarray(0, OLE_COMPOUND_FILE_SIGNATURE.byteLength).equals(OLE_COMPOUND_FILE_SIGNATURE)
  );
}

function safeSheetNames(value) {
  if (
    !Array.isArray(value) ||
    value.length > 1_000 ||
    value.some((name) => typeof name !== 'string' || name.length < 1 || name.length > 255)
  ) {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet has invalid worksheet metadata.');
  }
  return value;
}

function selectedSheetNames(allSheetNames, options) {
  if (allSheetNames.length > options.maxSheets) {
    fail('FILE_LIMIT_EXCEEDED', 'The workbook contains more sheets than the configured limit.');
  }
  if (options.sheetMode === 'all') return allSheetNames;
  return options.sheetNames.map((name) => {
    if (!allSheetNames.includes(name)) {
      fail('FILE_OUTPUT_INVALID', 'A requested worksheet does not exist.');
    }
    return name;
  });
}

function sheetProperty(worksheet, property) {
  return Reflect.get(worksheet, property);
}

function sheetCell(worksheet, rowNumber, columnNumber) {
  const value = sheetProperty(
    worksheet,
    xlsx.utils.encode_cell({ c: columnNumber - 1, r: rowNumber - 1 }),
  );
  if (typeof value !== 'object' || value === null) return null;
  const type = Reflect.get(value, 't');
  if (
    type !== 'b' &&
    type !== 'd' &&
    type !== 'e' &&
    type !== 'n' &&
    type !== 's' &&
    type !== 'z'
  ) {
    return null;
  }
  return value;
}

function worksheetBounds(worksheet, options) {
  if (typeof sheetProperty(worksheet, '!fullref') === 'string') {
    fail(
      'FILE_LIMIT_EXCEEDED',
      'The legacy spreadsheet contains rows beyond the configured processing limit.',
    );
  }
  const reference = sheetProperty(worksheet, '!ref');
  if (reference === undefined) return { columnCount: 0, rowCount: 0 };
  if (typeof reference !== 'string' || reference.length > 100) {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet has an invalid worksheet range.');
  }
  let decoded;
  try {
    decoded = xlsx.utils.decode_range(reference);
  } catch {
    fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet has an invalid worksheet range.');
  }
  const columnCount = decoded.e.c + 1;
  const rowCount = decoded.e.r + 1;
  if (columnCount > options.maxColumns) {
    fail('FILE_LIMIT_EXCEEDED', 'The spreadsheet contains more columns than the configured limit.');
  }
  if (rowCount > options.maxRows + options.headerRow + options.headerScanRows) {
    fail(
      'FILE_LIMIT_EXCEEDED',
      'The spreadsheet contains rows beyond the configured processing limit.',
    );
  }
  return { columnCount, rowCount };
}

function scalarCell(cell) {
  if (cell === null || cell.t === 'e' || cell.t === 'z') return null;
  const value = cell.v;
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  return String(value).slice(0, 32_000);
}

function populatedRowValues(worksheet, rowNumber, columnCount) {
  return Array.from({ length: columnCount }, (_, index) =>
    scalarCell(sheetCell(worksheet, rowNumber, index + 1)),
  ).filter((value) => value !== null && String(value).trim() !== '');
}

function headerCandidateScore(worksheet, rowNumber, bounds) {
  const values = populatedRowValues(worksheet, rowNumber, bounds.columnCount);
  if (values.length < 2) return Number.NEGATIVE_INFINITY;

  const normalized = values.map((value) => String(value).trim().toLocaleLowerCase());
  const uniqueCount = new Set(normalized).size;
  const textCount = values.filter((value) => typeof value === 'string').length;
  const keywordCount = normalized.filter(looksLikeSpreadsheetHeader).length;
  const shortLabelCount = normalized.filter((value) => value.length <= 80).length;
  let followingDataRows = 0;
  for (
    let candidate = rowNumber + 1;
    candidate <= Math.min(bounds.rowCount, rowNumber + 5);
    candidate += 1
  ) {
    if (
      populatedRowValues(worksheet, candidate, bounds.columnCount).length >=
      Math.min(2, values.length)
    ) {
      followingDataRows += 1;
    }
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

function detectedHeaderRow(worksheet, options, bounds) {
  if (options.headerMode === 'fixed') return options.headerRow;
  const lastCandidate = Math.min(
    bounds.rowCount,
    options.headerScanRows,
    options.headerRow + options.headerScanRows - 1,
  );
  let bestRow = options.headerRow;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let rowNumber = options.headerRow; rowNumber <= lastCandidate; rowNumber += 1) {
    const score = headerCandidateScore(worksheet, rowNumber, bounds);
    if (score > bestScore) {
      bestRow = rowNumber;
      bestScore = score;
    }
  }
  return bestRow;
}

function uniqueHeaders(worksheet, headerRow, columnCount) {
  const seen = new Map();
  const headers = [];
  for (let column = 1; column <= columnCount; column += 1) {
    const value = scalarCell(sheetCell(worksheet, headerRow, column));
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

function worksheetFormulaCellCount(worksheet) {
  let count = 0;
  for (const key of Object.keys(worksheet)) {
    if (key.startsWith('!')) continue;
    const cell = sheetProperty(worksheet, key);
    if (typeof cell === 'object' && cell !== null && typeof Reflect.get(cell, 'f') === 'string') {
      count += 1;
    }
  }
  return count;
}

function worksheetToTable(worksheet, name, options) {
  const bounds = worksheetBounds(worksheet, options);
  const headerRow = detectedHeaderRow(worksheet, options, bounds);
  const columns = uniqueHeaders(worksheet, headerRow, bounds.columnCount);
  const rows = [];
  for (let rowNumber = headerRow + 1; rowNumber <= bounds.rowCount; rowNumber += 1) {
    const entries = columns.map((column, columnIndex) => [
      column,
      scalarCell(sheetCell(worksheet, rowNumber, columnIndex + 1)),
    ]);
    if (entries.every(([, value]) => value === null || value === '')) continue;
    rows.push(Object.fromEntries(entries));
  }
  return {
    formulaCellCount: worksheetFormulaCellCount(worksheet),
    table: { columns, headerRow, name: name.slice(0, 100), rows },
  };
}

async function parseLegacyXls(input) {
  let sheetNames;
  let workbook;
  {
    let buffer;
    try {
      buffer = await readFile(input.filePath);
    } catch {
      fail('FILE_NOT_FOUND', 'The local spreadsheet was not found.', true);
    }
    if (buffer.byteLength > input.options.maxFileSizeBytes) {
      fail('FILE_LIMIT_EXCEEDED', 'The spreadsheet exceeds the configured file-size limit.');
    }
    if (!isOleCompoundWorkbook(buffer)) {
      fail(
        'FILE_UNSAFE_CONTENT',
        'The legacy spreadsheet does not have the required OLE workbook signature.',
      );
    }

    let metadata;
    try {
      metadata = xlsx.read(buffer, {
        ...workbookReadOptions(),
        bookSheets: true,
        cellFormula: false,
      });
    } catch {
      fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet could not be parsed safely.');
    }
    const allSheetNames = safeSheetNames(metadata.SheetNames);
    sheetNames = selectedSheetNames(allSheetNames, input.options);

    try {
      workbook = xlsx.read(buffer, {
        ...workbookReadOptions(),
        sheetRows:
          input.options.maxRows + input.options.headerRow + input.options.headerScanRows + 1,
        sheets: [...sheetNames],
      });
    } catch {
      fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet could not be parsed safely.');
    }
  }

  const sheets = [];
  let formulaCellCount = 0;
  let totalRows = 0;
  for (const name of sheetNames) {
    const worksheet = workbook.Sheets[name];
    if (worksheet === undefined) {
      fail('FILE_UNSAFE_CONTENT', 'The legacy spreadsheet is missing a declared worksheet.');
    }
    const result = worksheetToTable(worksheet, name, input.options);
    formulaCellCount += result.formulaCellCount;
    totalRows += result.table.rows.length;
    if (totalRows > input.options.maxRows) {
      fail('FILE_LIMIT_EXCEEDED', 'The spreadsheet contains more rows than the configured limit.');
    }
    sheets.push(result.table);
    Reflect.deleteProperty(workbook.Sheets, name);
  }
  return { formulaCellCount, sheets };
}

async function main() {
  if (parentPort === null) return;
  try {
    const input = workerInput(workerData);
    const value = await parseLegacyXls(input);
    parentPort.postMessage({ type: 'success', value });
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      Reflect.get(error, 'safeLegacyXlsError') === true &&
      ERROR_CODES.has(Reflect.get(error, 'code'))
        ? Reflect.get(error, 'code')
        : 'FILE_UNSAFE_CONTENT';
    const message =
      typeof error === 'object' &&
      error !== null &&
      Reflect.get(error, 'safeLegacyXlsError') === true &&
      typeof Reflect.get(error, 'message') === 'string'
        ? Reflect.get(error, 'message')
        : 'The legacy spreadsheet could not be parsed safely.';
    const retryable =
      typeof error === 'object' &&
      error !== null &&
      Reflect.get(error, 'safeLegacyXlsError') === true &&
      Reflect.get(error, 'retryable') === true;
    parentPort.postMessage({
      error: { code, message: String(message).slice(0, 300), retryable },
      type: 'failure',
    });
  }
}

void main();
