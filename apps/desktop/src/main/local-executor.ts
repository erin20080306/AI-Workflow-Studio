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
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { FolderGrantStore } from './folder-grants';

export interface AuthorizedInput {
  readonly folderAliasId: string;
  readonly relativePath: string;
}

export interface AuthorizedOutput {
  readonly folderAliasId: string;
  readonly outputName: string;
}

export interface AuthorizedFileList {
  readonly folderAliasId: string;
  readonly modifiedSince?: string;
  readonly pattern: string;
}

export class DesktopSpreadsheetExecutor {
  constructor(
    private readonly folderGrants: FolderGrantStore,
    private readonly ledger: ProcessingLedger,
  ) {}

  capabilities(): readonly string[] {
    return [
      'folder.list_files',
      'excel.read',
      'excel.merge',
      'excel.write',
      'excel.create_report',
      'data.filter',
      'data.map_columns',
      'data.deduplicate',
      'folder.file_created',
      'folder.file_changed',
    ];
  }

  async list(deviceId: string, input: AuthorizedFileList): Promise<readonly string[]> {
    const rootPath = await this.folderGrants.resolveAuthorizedRoot(
      input.folderAliasId,
      deviceId,
      'read',
    );
    const modifiedSince =
      input.modifiedSince === undefined ? undefined : new Date(input.modifiedSince);
    if (modifiedSince !== undefined && Number.isNaN(modifiedSince.getTime())) {
      throw new Error('Folder list modifiedSince value is invalid.');
    }
    const matcher = filePattern(input.pattern);
    const entries = await readdir(rootPath, { withFileTypes: true });
    const paths: string[] = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !matcher.test(entry.name)) {
        continue;
      }
      if (modifiedSince !== undefined) {
        const metadata = await lstat(join(rootPath, entry.name));
        if (!metadata.isFile() || metadata.mtime.getTime() < modifiedSince.getTime()) {
          continue;
        }
      }
      paths.push(entry.name);
      if (paths.length >= 1_000) {
        break;
      }
    }
    return paths;
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

function filePattern(pattern: string): RegExp {
  if (
    pattern.length < 1 ||
    pattern.length > 120 ||
    pattern.includes('/') ||
    pattern.includes('\\') ||
    pattern.includes('..')
  ) {
    throw new Error('Folder list pattern is invalid.');
  }
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replaceAll('*', '.*').replaceAll('?', '.')}$`, 'iu');
}
