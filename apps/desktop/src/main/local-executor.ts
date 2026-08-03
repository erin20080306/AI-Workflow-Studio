import {
  ProcessingLedger,
  SafeFolderWatcher,
  aggregateRows,
  deduplicateRows,
  filterRows,
  groupRows,
  mapColumns,
  mergeTables,
  readSpreadsheet,
  writeSpreadsheetAtomic,
  sortRows,
  validateRows,
  type AggregateOperation,
  type FilterCondition,
  type SafeFileWatchEvent,
  type SortField,
  type SpreadsheetReadControl,
  type SpreadsheetReadOptions,
  type SpreadsheetTable,
  type SpreadsheetWriteResult,
  type ValidationRule,
} from '@ai-workflow-studio/local-executor';
import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { FolderGrantStore } from './folder-grants';

export interface AuthorizedInput {
  readonly folderAliasId: string;
  readonly relativePath: string;
}

export interface AuthorizedOutput {
  readonly folderAliasId: string;
  readonly outputName: string;
  readonly reportTitle?: string;
}

export interface AuthorizedFileList {
  readonly folderAliasId: string;
  readonly modifiedSince?: string;
  readonly pattern: string;
}

export interface DriveExcelStagingFile {
  readonly fileId: string;
  readonly fileName: string;
}

export interface DriveExcelStagingResult {
  readonly folderAliasId: string;
  readonly inputHashes: readonly string[];
  readonly paths: readonly string[];
}

export interface VisibleDriveDownloadWorkspace {
  readonly downloadDirectory: string;
  readonly workDirectory: string;
  readonly workRelativePath: string;
}

export class DesktopSpreadsheetExecutor {
  constructor(
    private readonly folderGrants: FolderGrantStore,
    private readonly ledger: ProcessingLedger,
    private readonly openPath?: (absolutePath: string) => Promise<string>,
  ) {}

  capabilities(): readonly string[] {
    return [
      'folder.list_files',
      'excel.read',
      'excel.merge',
      'excel.write',
      'excel.create_report',
      'excel.open_file',
      'excel.visible_review',
      'google_drive.download_excel_folder',
      'google_drive.visible_download_folder',
      'data.filter',
      'data.sort',
      'data.group',
      'data.aggregate',
      'data.map_columns',
      'data.deduplicate',
      'data.validate',
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

  async read(
    deviceId: string,
    input: AuthorizedInput,
    options: SpreadsheetReadOptions = {},
    control: SpreadsheetReadControl = {},
  ) {
    const filePath = await this.folderGrants.resolveAuthorizedPath(
      input.folderAliasId,
      deviceId,
      input.relativePath,
      'read',
    );
    return await readSpreadsheet(filePath, options, control);
  }

  async stageDriveExcelFiles(
    deviceId: string,
    jobId: string,
    folderAliasId: string,
    files: readonly DriveExcelStagingFile[],
    download: (file: DriveExcelStagingFile) => Promise<Uint8Array>,
  ): Promise<DriveExcelStagingResult> {
    if (files.length === 0 || files.length > 500) {
      throw new Error('Drive workbook staging requires between 1 and 500 files.');
    }
    const work = await this.folderGrants.resolveAuthorizedWorkDirectory(
      folderAliasId,
      deviceId,
      jobId,
    );
    const usedNames = new Set<string>();
    const prepared = files.map((file) => {
      const baseName = safeWorkbookName(file.fileName);
      let outputName = baseName;
      if (usedNames.has(outputName.toLowerCase())) {
        const extension = extname(baseName);
        const fileIdHash = createHash('sha256').update(file.fileId).digest('hex').slice(0, 8);
        outputName = `${baseName.slice(0, -extension.length)}-${fileIdHash}${extension}`;
        let suffix = 2;
        while (usedNames.has(outputName.toLowerCase())) {
          outputName = `${baseName.slice(0, -extension.length)}-${fileIdHash}-${suffix}${extension}`;
          suffix += 1;
        }
      }
      usedNames.add(outputName.toLowerCase());
      return { file, outputName };
    });
    const staged = await mapWithConcurrency(prepared, 6, async ({ file, outputName }) => {
      let relativePath = `${work.relativePath}/${outputName}`;
      let target = await this.folderGrants.resolveAuthorizedOutputPath(
        folderAliasId,
        deviceId,
        relativePath,
      );
      const bytes = await download(file);
      if (bytes.byteLength < 1 || bytes.byteLength > 20_000_000) {
        throw new Error('A transferred Drive workbook has an invalid size.');
      }
      const inputHash = createHash('sha256').update(bytes).digest('hex');
      let existingHash = await existingFileHash(target);
      if (existingHash !== undefined && existingHash !== inputHash) {
        const extension = extname(outputName);
        outputName = `${outputName.slice(0, -extension.length)}-${inputHash.slice(0, 8)}${extension}`;
        relativePath = `${work.relativePath}/${outputName}`;
        target = await this.folderGrants.resolveAuthorizedOutputPath(
          folderAliasId,
          deviceId,
          relativePath,
        );
        existingHash = await existingFileHash(target);
        if (existingHash !== undefined && existingHash !== inputHash) {
          throw new Error('A staged workbook name conflicts with an existing local file.');
        }
      }
      if (existingHash !== inputHash) {
        const temporary = join(work.absolutePath, `.${outputName}.${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
          await link(temporary, target);
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code !== 'EEXIST' ||
            (await existingFileHash(target)) !== inputHash
          ) {
            throw error;
          }
        } finally {
          await rm(temporary, { force: true }).catch(() => undefined);
        }
      }
      return { inputHash, relativePath };
    });
    return {
      folderAliasId,
      inputHashes: staged.map((file) => file.inputHash),
      paths: staged.map((file) => file.relativePath),
    };
  }

  async prepareVisibleDriveDownload(
    deviceId: string,
    jobId: string,
    folderAliasId: string,
  ): Promise<VisibleDriveDownloadWorkspace> {
    const downloadDirectory = await this.folderGrants.resolveAuthorizedRoot(
      folderAliasId,
      deviceId,
      'write',
    );
    const work = await this.folderGrants.resolveAuthorizedWorkDirectory(
      folderAliasId,
      deviceId,
      jobId,
    );
    return {
      downloadDirectory,
      workDirectory: work.absolutePath,
      workRelativePath: work.relativePath,
    };
  }

  async openWorkbook(deviceId: string, input: AuthorizedInput): Promise<void> {
    if (this.openPath === undefined) throw new Error('Workbook opening is unavailable.');
    const filePath = await this.resolveWorkbookPath(deviceId, input);
    const result = await this.openPath(filePath);
    if (result.trim() !== '') throw new Error('Microsoft Excel could not open the workbook.');
  }

  async resolveWorkbookPath(deviceId: string, input: AuthorizedInput): Promise<string> {
    const filePath = await this.folderGrants.resolveAuthorizedPath(
      input.folderAliasId,
      deviceId,
      input.relativePath,
      'read',
    );
    if (extname(filePath).toLowerCase() !== '.xlsx') {
      throw new Error('Only an approved .xlsx workbook can be operated by the Agent.');
    }
    return filePath;
  }

  transform(
    tables: readonly SpreadsheetTable[],
    options: {
      readonly columnMode?: 'strict' | 'union';
      readonly aggregate?: {
        readonly groupBy: readonly string[];
        readonly operations: readonly AggregateOperation[];
      };
      readonly deduplicate?: { readonly keep?: 'first' | 'last'; readonly keys: readonly string[] };
      readonly filter?: {
        readonly conditions: readonly FilterCondition[];
        readonly match?: 'all' | 'any';
      };
      readonly groupBy?: readonly string[];
      readonly mappings?: Readonly<Record<string, string>>;
      readonly preserveUnmapped?: boolean;
      readonly sort?: readonly SortField[];
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
    if (options.sort !== undefined) table = sortRows(table, options.sort);
    if (options.groupBy !== undefined) table = groupRows(table, options.groupBy);
    if (options.aggregate !== undefined) {
      table = aggregateRows(table, options.aggregate.groupBy, options.aggregate.operations);
    }
    return table;
  }

  validate(
    tables: readonly SpreadsheetTable[],
    rules: readonly ValidationRule[],
  ): { readonly invalid: SpreadsheetTable; readonly valid: SpreadsheetTable } {
    return validateRows(mergeTables(tables), rules);
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
        ...(output.reportTitle === undefined ? {} : { reportTitle: output.reportTitle }),
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

function safeWorkbookName(input: string): string {
  let normalized = input
    .normalize('NFKC')
    .replace(/[\p{Cc}<>"/\\|?*:]/gu, '_')
    .replace(/\.xlsx$/iu, '')
    .trim()
    .replace(/[. ]+$/u, '')
    .slice(0, 180);
  if (/^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])$/iu.test(normalized)) {
    normalized = `${normalized}_`;
  }
  return `${normalized || 'workbook'}.xlsx`;
}

async function existingFileHash(path: string): Promise<string | undefined> {
  try {
    return createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) results[index] = await mapper(value);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => await worker()),
  );
  return results;
}
