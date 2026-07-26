import { watch, type FSWatcher } from 'chokidar';
import { realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative } from 'node:path';

import { LocalExecutorError } from './errors';
import { hashFile } from './hash';

export interface SafeFileWatchEvent {
  readonly absolutePath: string;
  readonly event: 'created' | 'changed';
  readonly fileHash: string;
  readonly fileName: string;
}

export interface SafeFolderWatcherOptions {
  readonly debounceMs?: number;
  readonly onError?: (error: Error) => void;
  readonly onFile: (event: SafeFileWatchEvent) => Promise<void> | void;
  readonly pattern: string;
  readonly rootPath: string;
}

function globMatcher(pattern: string): (name: string) => boolean {
  if (
    pattern.length === 0 ||
    pattern.length > 120 ||
    pattern.includes('/') ||
    pattern.includes('\\') ||
    pattern.includes('..')
  ) {
    throw new LocalExecutorError(
      'WATCH_CONFIGURATION_INVALID',
      'The file watch pattern is invalid.',
    );
  }
  const expression = pattern
    .replaceAll(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '.*')
    .replaceAll('?', '.');
  const regex = new RegExp(`^${expression}$`, 'i');
  return (name) => regex.test(name);
}

function isContained(root: string, target: string): boolean {
  const containment = relative(root, target);
  return (
    containment !== '..' &&
    !containment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
    !isAbsolute(containment)
  );
}

export class SafeFolderWatcher {
  private readonly matches: (name: string) => boolean;
  private readonly seenHashes = new Map<string, string>();
  private canonicalRoot: string | undefined;
  private watcher: FSWatcher | undefined;

  constructor(private readonly options: SafeFolderWatcherOptions) {
    this.matches = globMatcher(options.pattern);
  }

  async start(): Promise<void> {
    if (this.watcher !== undefined) {
      return;
    }
    this.canonicalRoot = await realpath(this.options.rootPath);
    if (!(await stat(this.canonicalRoot)).isDirectory()) {
      throw new LocalExecutorError(
        'WATCH_CONFIGURATION_INVALID',
        'The watched local grant is not a directory.',
      );
    }
    const watcher = watch(this.canonicalRoot, {
      awaitWriteFinish: {
        pollInterval: 100,
        stabilityThreshold: this.options.debounceMs ?? 500,
      },
      depth: 1,
      followSymlinks: false,
      ignoreInitial: true,
      interval: 250,
      persistent: true,
      usePolling: true,
    });
    watcher.on('add', (filePath) => {
      void this.handle('created', filePath);
    });
    watcher.on('change', (filePath) => {
      void this.handle('changed', filePath);
    });
    this.watcher = watcher;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: unknown) => {
        watcher.off('ready', onReady);
        reject(error instanceof Error ? error : new Error('Local folder watcher failed.'));
      };
      const onReady = () => {
        watcher.off('error', onError);
        resolve();
      };
      watcher.once('ready', onReady);
      watcher.once('error', onError);
    });
    watcher.on('error', (error) =>
      this.options.onError?.(
        error instanceof Error ? error : new Error('Local folder watcher failed.'),
      ),
    );
  }

  async stop(): Promise<void> {
    const watcher = this.watcher;
    this.watcher = undefined;
    this.canonicalRoot = undefined;
    if (watcher !== undefined) {
      await watcher.close();
    }
  }

  private async handle(event: SafeFileWatchEvent['event'], filePath: string): Promise<void> {
    const root = this.canonicalRoot;
    if (root === undefined || !this.matches(basename(filePath))) {
      return;
    }
    try {
      const canonicalFile = await realpath(filePath);
      if (!isContained(root, canonicalFile) || !(await stat(canonicalFile)).isFile()) {
        return;
      }
      const fileHash = await hashFile(canonicalFile);
      if (this.seenHashes.get(canonicalFile) === fileHash) {
        return;
      }
      this.seenHashes.set(canonicalFile, fileHash);
      await this.options.onFile({
        absolutePath: canonicalFile,
        event,
        fileHash,
        fileName: basename(canonicalFile),
      });
    } catch {
      // A removed, unstable, or unauthorized path produces no workflow event.
    }
  }
}
