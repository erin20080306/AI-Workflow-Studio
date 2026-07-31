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

export interface SortField {
  readonly direction?: 'asc' | 'desc';
  readonly field: string;
  readonly nulls?: 'first' | 'last';
}

export interface AggregateOperation {
  readonly alias: string;
  readonly field?: string;
  readonly operation: 'average' | 'count' | 'max' | 'min' | 'sum';
}

export interface ValidationRule {
  readonly dataType?: 'boolean' | 'date' | 'datetime' | 'number' | 'string';
  readonly field: string;
  readonly max?: number;
  readonly min?: number;
  readonly pattern?: string;
  readonly required?: boolean;
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

function requireColumns(table: SpreadsheetTable, fields: readonly string[], operation: string) {
  if (fields.some((field) => !table.columns.includes(field))) {
    throw new LocalExecutorError(
      'FILE_OUTPUT_INVALID',
      `${operation} fields must reference existing columns.`,
    );
  }
}

export function sortRows(table: SpreadsheetTable, fields: readonly SortField[]): SpreadsheetTable {
  requireColumns(
    table,
    fields.map((field) => field.field),
    'Sort',
  );
  const rows = table.rows.map((row, index) => ({ index, row }));
  rows.sort((left, right) => {
    for (const field of fields) {
      const leftValue = left.row[field.field] ?? null;
      const rightValue = right.row[field.field] ?? null;
      if (leftValue === null || rightValue === null) {
        if (leftValue === rightValue) continue;
        const nullOrder = field.nulls === 'first' ? -1 : 1;
        return leftValue === null ? nullOrder : -nullOrder;
      }
      const order = compare(leftValue, rightValue);
      if (order !== 0) return field.direction === 'desc' ? -order : order;
    }
    return left.index - right.index;
  });
  return { ...table, rows: rows.map(({ row }) => row) };
}

export function groupRows(table: SpreadsheetTable, keys: readonly string[]): SpreadsheetTable {
  return {
    ...sortRows(
      table,
      keys.map((field) => ({ direction: 'asc', field, nulls: 'last' })),
    ),
    name: `${table.name} Grouped`,
  };
}

export function aggregateRows(
  table: SpreadsheetTable,
  groupBy: readonly string[],
  operations: readonly AggregateOperation[],
): SpreadsheetTable {
  requireColumns(table, groupBy, 'Group');
  requireColumns(
    table,
    operations.flatMap((operation) => (operation.field === undefined ? [] : [operation.field])),
    'Aggregate',
  );
  const columns = [...groupBy, ...operations.map((operation) => operation.alias)];
  if (new Set(columns).size !== columns.length) {
    throw new LocalExecutorError('FILE_OUTPUT_INVALID', 'Aggregate output columns must be unique.');
  }
  const groups = new Map<
    string,
    { readonly keys: readonly SpreadsheetCell[]; rows: SpreadsheetRow[] }
  >();
  for (const row of table.rows) {
    const keys = groupBy.map((field) => row[field] ?? null);
    const key = keys.map(cellKey).join('\u001f');
    const group = groups.get(key) ?? { keys, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  if (groups.size === 0 && groupBy.length === 0) groups.set('', { keys: [], rows: [] });

  const rows = [...groups.values()].map((group) => {
    const result: Record<string, SpreadsheetCell> = Object.fromEntries(
      groupBy.map((field, index) => [field, group.keys[index] ?? null]),
    );
    for (const operation of operations) {
      const values =
        operation.field === undefined
          ? group.rows.map(() => 1)
          : group.rows.map((row) => row[operation.field ?? ''] ?? null);
      const populated = values.filter((value) => value !== null && value !== '');
      const numeric = populated.filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value),
      );
      switch (operation.operation) {
        case 'count':
          result[operation.alias] = populated.length;
          break;
        case 'sum':
          result[operation.alias] = numeric.reduce((sum, value) => sum + value, 0);
          break;
        case 'average':
          result[operation.alias] =
            numeric.length === 0
              ? null
              : numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
          break;
        case 'min':
          result[operation.alias] = numeric.length === 0 ? null : Math.min(...numeric);
          break;
        case 'max':
          result[operation.alias] = numeric.length === 0 ? null : Math.max(...numeric);
          break;
      }
    }
    return result;
  });
  return { columns, name: `${table.name} Summary`, rows };
}

function validDataType(value: SpreadsheetCell, dataType: NonNullable<ValidationRule['dataType']>) {
  if (dataType === 'string') return typeof value === 'string';
  if (dataType === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (dataType === 'boolean') return typeof value === 'boolean';
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && (dataType === 'datetime' || /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function validateRows(
  table: SpreadsheetTable,
  rules: readonly ValidationRule[],
): { readonly invalid: SpreadsheetTable; readonly valid: SpreadsheetTable } {
  requireColumns(
    table,
    rules.map((rule) => rule.field),
    'Validation',
  );
  const patterns = new Map<string, RegExp>();
  for (const rule of rules) {
    if (rule.pattern === undefined || patterns.has(rule.pattern)) continue;
    try {
      patterns.set(rule.pattern, new RegExp(rule.pattern, 'u'));
    } catch {
      throw new LocalExecutorError(
        'FILE_OUTPUT_INVALID',
        'Validation patterns must be valid regular expressions.',
      );
    }
  }
  const valid: SpreadsheetRow[] = [];
  const invalid: SpreadsheetRow[] = [];
  for (const row of table.rows) {
    const errors: string[] = [];
    for (const rule of rules) {
      const value = row[rule.field] ?? null;
      const empty = value === null || value === '';
      if (rule.required === true && empty) errors.push(`${rule.field}:required`);
      if (empty) continue;
      if (rule.dataType !== undefined && !validDataType(value, rule.dataType)) {
        errors.push(`${rule.field}:type`);
      }
      if (rule.pattern !== undefined && !patterns.get(rule.pattern)?.test(String(value))) {
        errors.push(`${rule.field}:pattern`);
      }
      if (rule.min !== undefined && (typeof value !== 'number' || value < rule.min)) {
        errors.push(`${rule.field}:min`);
      }
      if (rule.max !== undefined && (typeof value !== 'number' || value > rule.max)) {
        errors.push(`${rule.field}:max`);
      }
    }
    if (errors.length === 0) valid.push(row);
    else invalid.push({ ...row, _validation_errors: errors.join(',') });
  }
  return {
    invalid: {
      columns: [...table.columns, '_validation_errors'],
      name: `${table.name} Invalid`,
      rows: invalid,
    },
    valid: { ...table, name: `${table.name} Valid`, rows: valid },
  };
}
