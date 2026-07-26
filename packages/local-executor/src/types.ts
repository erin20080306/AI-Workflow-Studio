export type SpreadsheetCell = boolean | null | number | string;
export type SpreadsheetRow = Readonly<Record<string, SpreadsheetCell>>;

export interface SpreadsheetTable {
  readonly columns: readonly string[];
  readonly name: string;
  readonly rows: readonly SpreadsheetRow[];
}

export interface SpreadsheetSourceMetadata {
  readonly fileHash: string;
  readonly fileSizeBytes: number;
  readonly format: 'csv' | 'xlsx';
  readonly formulaCellCount: number;
}

export interface SpreadsheetDocument {
  readonly sheets: readonly SpreadsheetTable[];
  readonly source: SpreadsheetSourceMetadata;
}

export interface SpreadsheetReadOptions {
  readonly headerRow?: number;
  readonly maxColumns?: number;
  readonly maxCompressionRatio?: number;
  readonly maxFileSizeBytes?: number;
  readonly maxRows?: number;
  readonly maxSheets?: number;
  readonly maxUncompressedBytes?: number;
  readonly sheetMode?: 'all' | 'named';
  readonly sheetNames?: readonly string[];
}

export interface ResolvedSpreadsheetReadOptions {
  readonly headerRow: number;
  readonly maxColumns: number;
  readonly maxCompressionRatio: number;
  readonly maxFileSizeBytes: number;
  readonly maxRows: number;
  readonly maxSheets: number;
  readonly maxUncompressedBytes: number;
  readonly sheetMode: 'all' | 'named';
  readonly sheetNames?: readonly string[];
}

export interface SpreadsheetWriteOptions {
  readonly backupBeforeOverwrite?: boolean;
  readonly maxFileSizeBytes?: number;
  readonly maxRows?: number;
  readonly maxSheets?: number;
  readonly outputPath: string;
  readonly overwrite?: boolean;
}

export interface SpreadsheetWriteResult {
  readonly backupCreated: boolean;
  readonly fileHash: string;
  readonly fileSizeBytes: number;
  readonly processedRowCount: number;
  readonly sheetCount: number;
}
