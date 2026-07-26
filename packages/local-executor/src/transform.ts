import { LocalExecutorError } from './errors';
import type { SpreadsheetCell, SpreadsheetRow, SpreadsheetTable } from './types';

export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'is_empty'
  | 'is_not_empty'
  | 'less_than'
  | 'less_than_or_equal'
  | 'not_contains'
  | 'not_equals';

export interface FilterCondition {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value?: SpreadsheetCell;
}

function cellKey(value: SpreadsheetCell): string {
  return `${typeof value}:${value === null ? 'null' : String(value)}`;
}

function compare(left: SpreadsheetCell, right: SpreadsheetCell): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return -1;
  }
  if (right === null) {
    return 1;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

function matchesCondition(row: SpreadsheetRow, condition: FilterCondition): boolean {
  const actual = row[condition.field] ?? null;
  const expected = condition.value ?? null;
  switch (condition.operator) {
    case 'equals':
      return compare(actual, expected) === 0;
    case 'not_equals':
      return compare(actual, expected) !== 0;
    case 'contains':
      return String(actual ?? '').includes(String(expected ?? ''));
    case 'not_contains':
      return !String(actual ?? '').includes(String(expected ?? ''));
    case 'greater_than':
      return compare(actual, expected) > 0;
    case 'greater_than_or_equal':
      return compare(actual, expected) >= 0;
    case 'less_than':
      return compare(actual, expected) < 0;
    case 'less_than_or_equal':
      return compare(actual, expected) <= 0;
    case 'is_empty':
      return actual === null || actual === '';
    case 'is_not_empty':
      return actual !== null && actual !== '';
  }
}

export function mergeTables(
  tables: readonly SpreadsheetTable[],
  columnMode: 'strict' | 'union' = 'union',
  outputName = 'Merged',
): SpreadsheetTable {
  const first = tables[0];
  if (first === undefined) {
    return { columns: [], name: outputName, rows: [] };
  }
  const columns =
    columnMode === 'strict'
      ? [...first.columns]
      : [...new Set(tables.flatMap((table) => table.columns))];
  if (
    columnMode === 'strict' &&
    tables.some(
      (table) =>
        table.columns.length !== columns.length ||
        table.columns.some((column, index) => column !== columns[index]),
    )
  ) {
    throw new LocalExecutorError(
      'FILE_OUTPUT_INVALID',
      'Strict merge requires identical column order.',
    );
  }
  return {
    columns,
    name: outputName,
    rows: tables.flatMap((table) =>
      table.rows.map((row) =>
        Object.fromEntries(columns.map((column) => [column, row[column] ?? null])),
      ),
    ),
  };
}

export function mapColumns(
  table: SpreadsheetTable,
  mappings: Readonly<Record<string, string>>,
  preserveUnmapped = true,
): SpreadsheetTable {
  const columns: string[] = [];
  const mappedTargets = new Set<string>();
  for (const source of table.columns) {
    const target = mappings[source] ?? (preserveUnmapped ? source : undefined);
    if (target !== undefined && mappedTargets.has(target)) {
      throw new LocalExecutorError(
        'FILE_OUTPUT_INVALID',
        'Column mapping would create a duplicate output column.',
      );
    }
    if (target !== undefined) {
      mappedTargets.add(target);
      columns.push(target);
    }
  }
  return {
    columns,
    name: table.name,
    rows: table.rows.map((row) =>
      Object.fromEntries(
        table.columns.flatMap((source) => {
          const target = mappings[source] ?? (preserveUnmapped ? source : undefined);
          return target === undefined ? [] : [[target, row[source] ?? null] as const];
        }),
      ),
    ),
  };
}

export function filterRows(
  table: SpreadsheetTable,
  conditions: readonly FilterCondition[],
  match: 'all' | 'any' = 'all',
): SpreadsheetTable {
  return {
    ...table,
    rows: table.rows.filter((row) =>
      match === 'all'
        ? conditions.every((condition) => matchesCondition(row, condition))
        : conditions.some((condition) => matchesCondition(row, condition)),
    ),
  };
}

export function deduplicateRows(
  table: SpreadsheetTable,
  keys: readonly string[],
  keep: 'first' | 'last' = 'first',
): SpreadsheetTable {
  if (keys.length === 0 || keys.some((key) => !table.columns.includes(key))) {
    throw new LocalExecutorError(
      'FILE_OUTPUT_INVALID',
      'Deduplication keys must reference existing columns.',
    );
  }
  const selected = new Map<string, SpreadsheetRow>();
  const rows = keep === 'last' ? [...table.rows].reverse() : table.rows;
  for (const row of rows) {
    const key = keys.map((column) => cellKey(row[column] ?? null)).join('\u001f');
    if (!selected.has(key)) {
      selected.set(key, row);
    }
  }
  const uniqueRows = [...selected.values()];
  return {
    ...table,
    rows: keep === 'last' ? uniqueRows.reverse() : uniqueRows,
  };
}
