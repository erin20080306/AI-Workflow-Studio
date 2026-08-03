import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import { LocalExecutorError } from './errors';
import legacyXlsWorkerAssetUrl from './legacy-xls-worker.cjs?worker&url';
import type {
  ResolvedSpreadsheetReadOptions,
  SpreadsheetReadControl,
  SpreadsheetTable,
} from './types';

const DEFAULT_LEGACY_XLS_TIMEOUT_MS = 120_000;
const MAX_LEGACY_XLS_TIMEOUT_MS = 600_000;
const PACKAGED_LEGACY_WORKER_URL = '/assets/legacy-xls-worker.cjs';
const SOURCE_LEGACY_WORKER_RELATIVE_PATH = './legacy-xls-worker.cjs';
const CellSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const TableSchema = z
  .object({
    columns: z.array(z.string().max(200)).max(2_000),
    headerRow: z.number().int().min(1).max(100),
    name: z.string().max(100),
    rows: z.array(z.record(z.string(), CellSchema)).max(1_000_000),
  })
  .strict();
const WorkerResponseSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('success'),
      value: z
        .object({
          formulaCellCount: z.number().int().min(0).max(200_000_000),
          sheets: z.array(TableSchema).max(200),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      error: z
        .object({
          code: z.enum([
            'FILE_LIMIT_EXCEEDED',
            'FILE_NOT_FOUND',
            'FILE_OUTPUT_INVALID',
            'FILE_UNSAFE_CONTENT',
          ]),
          message: z.string().min(1).max(300),
          retryable: z.boolean(),
        })
        .strict(),
      type: z.literal('failure'),
    })
    .strict(),
]);

interface LegacyWorkbookData {
  readonly formulaCellCount: number;
  readonly sheets: readonly SpreadsheetTable[];
}

interface WorkerWaiter {
  readonly reject: (error: Error) => void;
  readonly resolve: (release: () => void) => void;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
}

let legacyWorkerBusy = false;
const legacyWorkerQueue: WorkerWaiter[] = [];

function abortError(): Error {
  const error = new Error('Legacy spreadsheet parsing was cancelled.');
  error.name = 'AbortError';
  return error;
}

function grantLegacyWorkerSlot(waiter: WorkerWaiter): void {
  waiter.signal?.removeEventListener('abort', waiter.onAbort ?? (() => undefined));
  let released = false;
  waiter.resolve(() => {
    if (released) return;
    released = true;
    releaseLegacyWorkerSlot();
  });
}

function releaseLegacyWorkerSlot(): void {
  while (legacyWorkerQueue.length > 0) {
    const waiter = legacyWorkerQueue.shift();
    if (waiter === undefined) break;
    if (waiter.signal?.aborted === true) {
      waiter.signal.removeEventListener('abort', waiter.onAbort ?? (() => undefined));
      waiter.reject(abortError());
      continue;
    }
    grantLegacyWorkerSlot(waiter);
    return;
  }
  legacyWorkerBusy = false;
}

async function acquireLegacyWorkerSlot(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted === true) throw abortError();
  return await new Promise<() => void>((resolve, reject) => {
    const queuedWaiter: WorkerWaiter = {
      reject,
      resolve,
      ...(signal === undefined
        ? {}
        : {
            onAbort: () => {
              const queueIndex = legacyWorkerQueue.indexOf(queuedWaiter);
              if (queueIndex >= 0) legacyWorkerQueue.splice(queueIndex, 1);
              reject(abortError());
            },
            signal,
          }),
    };
    if (!legacyWorkerBusy) {
      legacyWorkerBusy = true;
      grantLegacyWorkerSlot(queuedWaiter);
      return;
    }
    legacyWorkerQueue.push(queuedWaiter);
    if (queuedWaiter.onAbort !== undefined) {
      signal?.addEventListener('abort', queuedWaiter.onAbort, { once: true });
    }
  });
}

function legacyWorkerTimeoutMs(control: SpreadsheetReadControl): number {
  const timeoutMs = control.legacyXlsTimeoutMs ?? DEFAULT_LEGACY_XLS_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_LEGACY_XLS_TIMEOUT_MS) {
    throw new TypeError('Legacy spreadsheet timeout must be between 1 and 600000 milliseconds.');
  }
  return timeoutMs;
}

async function terminateWorker(worker: Worker): Promise<void> {
  try {
    await worker.terminate();
  } catch {
    // The worker may have already exited after delivering its single result.
  }
}

function legacyWorkerUrl(): URL {
  if (typeof __dirname === 'string' && legacyXlsWorkerAssetUrl === PACKAGED_LEGACY_WORKER_URL) {
    return pathToFileURL(join(__dirname, legacyXlsWorkerAssetUrl.replace(/^\/+/, '')));
  }
  return new URL(SOURCE_LEGACY_WORKER_RELATIVE_PATH, import.meta.url);
}

async function runLegacyWorker(
  filePath: string,
  options: ResolvedSpreadsheetReadOptions,
  control: SpreadsheetReadControl,
): Promise<LegacyWorkbookData> {
  const timeoutMs = legacyWorkerTimeoutMs(control);
  if (control.signal?.aborted === true) throw abortError();

  return await new Promise<LegacyWorkbookData>((resolve, reject) => {
    const worker = new Worker(legacyWorkerUrl(), {
      resourceLimits: {
        maxOldGenerationSizeMb: 384,
        maxYoungGenerationSizeMb: 64,
        stackSizeMb: 4,
      },
      workerData: { filePath, options },
    });
    let settled = false;
    const timeout = setTimeout(() => {
      void settleFailure(
        new LocalExecutorError(
          'FILE_UNSAFE_CONTENT',
          'The legacy spreadsheet parser exceeded its time limit.',
        ),
      );
    }, timeoutMs);
    timeout.unref?.();
    const onAbort = () => void settleFailure(abortError());
    const cleanup = () => {
      clearTimeout(timeout);
      control.signal?.removeEventListener('abort', onAbort);
      worker.removeAllListeners();
    };
    const settleFailure = async (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      await terminateWorker(worker);
      reject(error);
    };
    const settleSuccess = async (value: LegacyWorkbookData) => {
      if (settled) return;
      settled = true;
      cleanup();
      await terminateWorker(worker);
      resolve(value);
    };

    worker.once('message', (message: unknown) => {
      const parsed = WorkerResponseSchema.safeParse(message);
      if (!parsed.success) {
        void settleFailure(
          new LocalExecutorError(
            'FILE_UNSAFE_CONTENT',
            'The legacy spreadsheet worker returned an invalid result.',
          ),
        );
        return;
      }
      if (parsed.data.type === 'failure') {
        void settleFailure(
          new LocalExecutorError(parsed.data.error.code, parsed.data.error.message, {
            retryable: parsed.data.error.retryable,
          }),
        );
        return;
      }
      const totalRows = parsed.data.value.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
      if (
        parsed.data.value.sheets.length > options.maxSheets ||
        parsed.data.value.sheets.some((sheet) => sheet.columns.length > options.maxColumns) ||
        totalRows > options.maxRows
      ) {
        void settleFailure(
          new LocalExecutorError(
            'FILE_LIMIT_EXCEEDED',
            'The legacy spreadsheet worker exceeded the configured processing limit.',
          ),
        );
        return;
      }
      void settleSuccess(parsed.data.value);
    });
    worker.once('error', () => {
      void settleFailure(
        new LocalExecutorError(
          'FILE_UNSAFE_CONTENT',
          'The legacy spreadsheet worker could not parse the file safely.',
        ),
      );
    });
    worker.once('exit', (code) => {
      if (!settled) {
        void settleFailure(
          new LocalExecutorError(
            'FILE_UNSAFE_CONTENT',
            code === 0
              ? 'The legacy spreadsheet worker exited without a result.'
              : 'The legacy spreadsheet worker stopped unexpectedly.',
          ),
        );
      }
    });
    control.signal?.addEventListener('abort', onAbort, { once: true });
    if (control.signal?.aborted === true) onAbort();
  });
}

export async function readLegacyXls(
  filePath: string,
  options: ResolvedSpreadsheetReadOptions,
  control: SpreadsheetReadControl = {},
): Promise<LegacyWorkbookData> {
  const release = await acquireLegacyWorkerSlot(control.signal);
  try {
    return await runLegacyWorker(filePath, options, control);
  } finally {
    release();
  }
}
