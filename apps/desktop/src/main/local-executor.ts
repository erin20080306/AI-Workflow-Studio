import {
  ProcessingLedger,
  SafeFolderWatcher,
  deduplicateRows,
  filterRows,
  mapColumns,
  mergeTables,
  readSpreadsheet,
  writeSpreadsheetAtomic,
  type FilterCondition,
  type SafeFileWatchEvent,
  type SpreadsheetReadOptions,
  type SpreadsheetTable,
  type SpreadsheetWriteResult,
} from '@ai-workflow-studio/local-executor';

import { FolderGrantStore } from './folder-grants';

export interface AuthorizedInput {
  readonly folderAliasId: string;
  readonly relativePath: string;
}

export interface AuthorizedOutput {
  readonly folderAliasId: string;
  readonly outputName: string;
}

export class DesktopSpreadsheetExecutor {
  constructor(
    private readonly folderGrants: FolderGrantStore,
    private readonly ledger: ProcessingLedger,
  ) {}

  capabilities(): readonly string[] {
    return [
      'excel.read',
      'excel.merge',
      'excel.write',
      'data.filter',
      'data.map_columns',
      'data.deduplicate',
      'folder.file_created',
      'folder.file_changed',
    ];
  }

  async read(deviceId: string, input: AuthorizedInput, options: SpreadsheetReadOptions = {}) {
    const filePath = await this.folderGrants.resolveAuthorizedPath(
      input.folderAliasId,
      deviceId,
      input.relativePath,
      'read',
    );
    return await readSpreadsheet(filePath, options);
  }

  transform(
    tables: readonly SpreadsheetTable[],
    options: {
      readonly columnMode?: 'strict' | 'union';
      readonly deduplicate?: { readonly keep?: 'first' | 'last'; readonly keys: readonly string[] };
      readonly filter?: {
        readonly conditions: readonly FilterCondition[];
        readonly match?: 'all' | 'any';
      };
      readonly mappings?: Readonly<Record<string, string>>;
      readonly preserveUnmapped?: boolean;
    },
  ): SpreadsheetTable {
    let table = mergeTables(tables, options.columnMode);
    if (options.mappings !== undefined) {
      table = mapColumns(table, options.mappings, options.preserveUnmapped);
    }
    if (options.filter !== undefined) {
      table = filterRows(table, options.filter.conditions, options.filter.match);
    }
    if (options.deduplicate !== undefined) {
      table = deduplicateRows(table, options.deduplicate.keys, options.deduplicate.keep);
    }
    return table;
  }

  async writeOnce(
    deviceId: string,
    contextKey: string,
    inputHashes: readonly string[],
    output: AuthorizedOutput,
    tables: readonly SpreadsheetTable[],
  ): Promise<{ readonly duplicate: boolean; readonly result?: SpreadsheetWriteResult }> {
    const claim = await this.ledger.claim(contextKey, inputHashes);
    if (claim !== 'claimed') {
      return { duplicate: true };
    }
    try {
      const outputPath = await this.folderGrants.resolveAuthorizedOutputPath(
        output.folderAliasId,
        deviceId,
        output.outputName,
      );
      const result = await writeSpreadsheetAtomic(tables, {
        outputPath,
        overwrite: false,
      });
      await this.ledger.complete(contextKey, inputHashes, result.fileHash);
      return { duplicate: false, result };
    } catch (error) {
      this.ledger.release(contextKey, inputHashes);
      throw error;
    }
  }

  async watch(
    deviceId: string,
    folderAliasId: string,
    pattern: string,
    onFile: (event: SafeFileWatchEvent) => Promise<void> | void,
    debounceMs?: number,
  ): Promise<SafeFolderWatcher> {
    const rootPath = await this.folderGrants.resolveAuthorizedRoot(
      folderAliasId,
      deviceId,
      'watch',
    );
    const watcher = new SafeFolderWatcher({
      ...(debounceMs === undefined ? {} : { debounceMs }),
      onFile,
      pattern,
      rootPath,
    });
    await watcher.start();
    return watcher;
  }
}
