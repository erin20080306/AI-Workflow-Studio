import yauzl, { type Entry, type ZipFile } from 'yauzl';

import { LocalExecutorError } from './errors';

export interface ZipSafetyLimits {
  readonly maxCompressionRatio: number;
  readonly maxEntries: number;
  readonly maxUncompressedBytes: number;
}

const FORBIDDEN_PARTS = [
  /^xl\/vbaProject\.bin$/i,
  /^xl\/embeddings\//i,
  /^xl\/externalLinks\//i,
] as const;

function unsafeEntry(entry: Entry): boolean {
  const normalized = entry.fileName.replaceAll('\\', '/');
  return (
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    normalized.split('/').includes('..') ||
    (entry.generalPurposeBitFlag & 0x1) !== 0 ||
    FORBIDDEN_PARTS.some((pattern) => pattern.test(normalized))
  );
}

export async function inspectXlsxArchive(filePath: string, limits: ZipSafetyLimits): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let entryCount = 0;
    let totalUncompressedBytes = 0;

    const fail = (zip: ZipFile | undefined, error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      zip?.close();
      reject(
        error instanceof LocalExecutorError
          ? error
          : new LocalExecutorError(
              'FILE_UNSAFE_CONTENT',
              'The Excel archive could not be validated safely.',
              { cause: error },
            ),
      );
    };

    yauzl.open(filePath, { autoClose: true, lazyEntries: true }, (openError, zip) => {
      if (openError !== null || zip === undefined) {
        fail(zip, openError);
        return;
      }
      zip.on('error', (error) => fail(zip, error));
      zip.on('end', () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      zip.on('entry', (entry) => {
        entryCount += 1;
        totalUncompressedBytes += entry.uncompressedSize;
        const ratio =
          entry.compressedSize === 0
            ? entry.uncompressedSize === 0
              ? 1
              : Number.POSITIVE_INFINITY
            : entry.uncompressedSize / entry.compressedSize;
        if (
          entryCount > limits.maxEntries ||
          totalUncompressedBytes > limits.maxUncompressedBytes ||
          ratio > limits.maxCompressionRatio
        ) {
          fail(
            zip,
            new LocalExecutorError(
              'FILE_LIMIT_EXCEEDED',
              'The Excel archive exceeds the safe decompression limits.',
            ),
          );
          return;
        }
        if (unsafeEntry(entry)) {
          fail(
            zip,
            new LocalExecutorError(
              'FILE_UNSAFE_CONTENT',
              'The Excel archive contains an unsupported or unsafe embedded part.',
            ),
          );
          return;
        }
        zip.readEntry();
      });
      zip.readEntry();
    });
  });
}
