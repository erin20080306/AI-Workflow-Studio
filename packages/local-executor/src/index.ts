export { LocalExecutorError, type LocalExecutorErrorCode } from './errors';
export { hashFile } from './hash';
export { ProcessingLedger, type ProcessingClaim } from './ledger';
export { readSpreadsheet } from './read';
export {
  aggregateRows,
  deduplicateRows,
  filterRows,
  groupRows,
  mapColumns,
  mergeTables,
  sortRows,
  validateRows,
  type AggregateOperation,
  type FilterCondition,
  type FilterOperator,
  type SortField,
  type ValidationRule,
} from './transform';
export type {
  ResolvedSpreadsheetReadOptions,
  SpreadsheetCell,
  SpreadsheetDocument,
  SpreadsheetReadOptions,
  SpreadsheetRow,
  SpreadsheetSourceMetadata,
  SpreadsheetTable,
  SpreadsheetWriteOptions,
  SpreadsheetWriteResult,
} from './types';
export {
  SafeFolderWatcher,
  type SafeFileWatchEvent,
  type SafeFolderWatcherOptions,
} from './watcher';
export { writeSpreadsheetAtomic } from './write';
export { inspectXlsxArchive, type ZipSafetyLimits } from './zip-safety';
