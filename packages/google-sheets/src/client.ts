import { createHash } from 'node:crypto';
import { z } from 'zod';

import { GoogleSheetsError } from './errors';
import type {
  GoogleCell,
  GoogleFetch,
  GoogleOperationStore,
  GoogleReadResult,
  GoogleSheetSummary,
  GoogleSpreadsheetSummary,
  GoogleValueRows,
  GoogleWriteResult,
} from './types';

const SpreadsheetIdSchema = z
  .string()
  .min(10)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
const RangeSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (range) =>
      ![...range].some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code <= 31 || code === 127;
      }) && !range.includes('://'),
    'Invalid A1 range.',
  );
const CellSchema = z.union([z.string().max(50_000), z.number().finite(), z.boolean(), z.null()]);
const RowsSchema = z.array(z.array(CellSchema).max(200)).max(10_000);
const DriveListSchema = z
  .object({
    files: z
      .array(
        z
          .object({
            id: SpreadsheetIdSchema,
            modifiedTime: z.iso.datetime({ offset: true }).optional(),
            name: z.string().min(1).max(500),
          })
          .passthrough(),
      )
      .max(100)
      .default([]),
  })
  .passthrough();
const SheetMetadataSchema = z
  .object({
    sheets: z
      .array(
        z
          .object({
            properties: z
              .object({
                gridProperties: z
                  .object({
                    columnCount: z.number().int().min(0).default(0),
                    rowCount: z.number().int().min(0).default(0),
                  })
                  .passthrough()
                  .default({ columnCount: 0, rowCount: 0 }),
                sheetId: z.number().int().min(0),
                title: z.string().min(1).max(500),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .max(500)
      .default([]),
  })
  .passthrough();
const ValuesResponseSchema = z
  .object({
    range: z.string().min(1).max(1_000),
    values: RowsSchema.default([]),
  })
  .passthrough();
const AppendResponseSchema = z
  .object({
    spreadsheetId: SpreadsheetIdSchema,
    updates: z
      .object({
        updatedCells: z.number().int().min(0).default(0),
        updatedColumns: z.number().int().min(0).default(0),
        updatedRows: z.number().int().min(0).default(0),
      })
      .passthrough(),
  })
  .passthrough();
const BatchUpdateResponseSchema = z
  .object({
    spreadsheetId: SpreadsheetIdSchema,
    totalUpdatedCells: z.number().int().min(0).default(0),
    totalUpdatedColumns: z.number().int().min(0).default(0),
    totalUpdatedRows: z.number().int().min(0).default(0),
  })
  .passthrough();

const MAX_REQUEST_BYTES = 2_000_000;
const MAX_RESPONSE_BYTES = 5_000_000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

type RetryMode = 'append' | 'idempotent' | 'read';

export interface GoogleSheetsClientOptions {
  readonly driveBaseUrl?: string;
  readonly fetchTransport?: GoogleFetch;
  readonly operationStore: GoogleOperationStore;
  readonly random?: () => number;
  readonly sheetsBaseUrl?: string;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface GoogleSyncInput {
  readonly conflictStrategy: 'destination_wins' | 'fail' | 'source_wins';
  readonly headers: readonly string[];
  readonly keyColumns: readonly string[];
  readonly rows: readonly Readonly<Record<string, GoogleCell>>[];
}

interface RequestOptions<T> {
  readonly accessToken: string;
  readonly body?: unknown;
  readonly method: 'GET' | 'POST';
  readonly retryMode: RetryMode;
  readonly schema: z.ZodType<T>;
  readonly signal?: AbortSignal;
  readonly url: string;
}

function validateBaseUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== 'https:') {
    throw new GoogleSheetsError('GOOGLE_NOT_CONFIGURED', 'Google API base URLs must use HTTPS.');
  }
  return url.toString().replace(/\/$/, '');
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizedAppendResult(value: z.infer<typeof AppendResponseSchema>): GoogleWriteResult {
  return {
    spreadsheetId: value.spreadsheetId,
    updatedCells: value.updates.updatedCells,
    updatedColumns: value.updates.updatedColumns,
    updatedRows: value.updates.updatedRows,
  };
}

function normalizedBatchResult(
  value: z.infer<typeof BatchUpdateResponseSchema>,
): GoogleWriteResult {
  return {
    spreadsheetId: value.spreadsheetId,
    updatedCells: value.totalUpdatedCells,
    updatedColumns: value.totalUpdatedColumns,
    updatedRows: value.totalUpdatedRows,
  };
}

function rowKey(row: Readonly<Record<string, GoogleCell>>, keyColumns: readonly string[]): string {
  return keyColumns
    .map((column) => {
      const value = row[column] ?? null;
      return `${typeof value}:${value === null ? 'null' : String(value)}`;
    })
    .join('\u001f');
}

function rowsToRecords(values: GoogleValueRows): {
  readonly headers: readonly string[];
  readonly rows: readonly Readonly<Record<string, GoogleCell>>[];
} {
  const headerValues = values[0] ?? [];
  const headers = headerValues.map(
    (value, index) => String(value ?? '').trim() || `Column_${index + 1}`,
  );
  return {
    headers,
    rows: values
      .slice(1)
      .map((row) =>
        Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])),
      ),
  };
}

export function mergeSyncRows(
  existingValues: GoogleValueRows,
  input: GoogleSyncInput,
): GoogleValueRows {
  if (
    input.headers.length === 0 ||
    input.headers.length > 200 ||
    input.keyColumns.length === 0 ||
    input.keyColumns.some((key) => !input.headers.includes(key))
  ) {
    throw new GoogleSheetsError(
      'GOOGLE_REQUEST_INVALID',
      'Google Sheets sync columns are invalid.',
    );
  }
  const existing = rowsToRecords(existingValues);
  if (
    existing.headers.length > 0 &&
    (existing.headers.length !== input.headers.length ||
      existing.headers.some((header, index) => header !== input.headers[index]))
  ) {
    throw new GoogleSheetsError(
      'GOOGLE_REQUEST_INVALID',
      'Google Sheets sync requires matching destination columns.',
    );
  }
  const merged = new Map(existing.rows.map((row) => [rowKey(row, input.keyColumns), row] as const));
  for (const source of input.rows) {
    const key = rowKey(source, input.keyColumns);
    const destination = merged.get(key);
    if (destination !== undefined && input.conflictStrategy === 'fail') {
      const differs = input.headers.some(
        (header) => (destination[header] ?? null) !== (source[header] ?? null),
      );
      if (differs) {
        throw new GoogleSheetsError(
          'GOOGLE_IDEMPOTENCY_CONFLICT',
          'Google Sheets sync found conflicting rows.',
        );
      }
    }
    if (destination === undefined || input.conflictStrategy === 'source_wins') {
      merged.set(key, source);
    }
  }
  return [
    input.headers,
    ...[...merged.values()].map((row) => input.headers.map((header) => row[header] ?? null)),
  ];
}

export class InMemoryGoogleOperationStore implements GoogleOperationStore {
  private readonly operations = new Map<
    string,
    | { readonly requestHash: string; readonly status: 'ambiguous' | 'pending' }
    | {
        readonly requestHash: string;
        readonly result: GoogleWriteResult;
        readonly status: 'completed';
      }
  >();

  async claim(
    connectionId: string,
    idempotencyKey: string,
    hash: string,
  ): Promise<
    'claimed' | 'conflict' | { readonly result: GoogleWriteResult; readonly status: 'completed' }
  > {
    const key = `${connectionId}:${idempotencyKey}`;
    const existing = this.operations.get(key);
    if (existing === undefined) {
      this.operations.set(key, { requestHash: hash, status: 'pending' });
      return 'claimed';
    }
    if (existing.requestHash !== hash) {
      return 'conflict';
    }
    return existing.status === 'completed'
      ? { result: structuredClone(existing.result), status: 'completed' }
      : 'conflict';
  }

  async complete(
    connectionId: string,
    idempotencyKey: string,
    hash: string,
    result: GoogleWriteResult,
  ): Promise<void> {
    this.operations.set(`${connectionId}:${idempotencyKey}`, {
      requestHash: hash,
      result: structuredClone(result),
      status: 'completed',
    });
  }

  async markAmbiguous(connectionId: string, idempotencyKey: string, hash: string): Promise<void> {
    this.operations.set(`${connectionId}:${idempotencyKey}`, {
      requestHash: hash,
      status: 'ambiguous',
    });
  }

  async release(connectionId: string, idempotencyKey: string, hash: string): Promise<void> {
    const key = `${connectionId}:${idempotencyKey}`;
    if (this.operations.get(key)?.requestHash === hash) {
      this.operations.delete(key);
    }
  }
}

export class GoogleSheetsClient {
  private readonly driveBaseUrl: string;
  private readonly fetchTransport: GoogleFetch;
  private readonly operationStore: GoogleOperationStore;
  private readonly random: () => number;
  private readonly sheetsBaseUrl: string;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: GoogleSheetsClientOptions) {
    this.driveBaseUrl = validateBaseUrl(
      options.driveBaseUrl ?? 'https://www.googleapis.com/drive/v3',
    );
    this.fetchTransport = options.fetchTransport ?? fetch;
    this.operationStore = options.operationStore;
    this.random = options.random ?? Math.random;
    this.sheetsBaseUrl = validateBaseUrl(
      options.sheetsBaseUrl ?? 'https://sheets.googleapis.com/v4',
    );
    this.sleep =
      options.sleep ??
      (async (milliseconds) => {
        await new Promise((resolve) => setTimeout(resolve, milliseconds));
      });
  }

  async listSpreadsheets(
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<readonly GoogleSpreadsheetSummary[]> {
    const query = new URLSearchParams({
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: '100',
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      spaces: 'drive',
    });
    const response = await this.request({
      accessToken,
      method: 'GET',
      retryMode: 'read',
      schema: DriveListSchema,
      ...(signal === undefined ? {} : { signal }),
      url: `${this.driveBaseUrl}/files?${query.toString()}`,
    });
    return response.files.map((file) => ({
      id: file.id,
      ...(file.modifiedTime === undefined ? {} : { modifiedTime: file.modifiedTime }),
      name: file.name,
    }));
  }

  async listSheets(
    accessToken: string,
    spreadsheetIdInput: string,
    signal?: AbortSignal,
  ): Promise<readonly GoogleSheetSummary[]> {
    const spreadsheetId = SpreadsheetIdSchema.parse(spreadsheetIdInput);
    const query = new URLSearchParams({
      fields: 'sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))',
    });
    const response = await this.request({
      accessToken,
      method: 'GET',
      retryMode: 'read',
      schema: SheetMetadataSchema,
      ...(signal === undefined ? {} : { signal }),
      url: `${this.sheetsBaseUrl}/spreadsheets/${encodeURIComponent(spreadsheetId)}?${query}`,
    });
    return response.sheets.map(({ properties }) => ({
      columnCount: properties.gridProperties.columnCount,
      rowCount: properties.gridProperties.rowCount,
      sheetId: properties.sheetId,
      title: properties.title,
    }));
  }

  async read(
    accessToken: string,
    spreadsheetIdInput: string,
    rangeInput: string,
    signal?: AbortSignal,
  ): Promise<GoogleReadResult> {
    const spreadsheetId = SpreadsheetIdSchema.parse(spreadsheetIdInput);
    const range = RangeSchema.parse(rangeInput);
    const query = new URLSearchParams({
      dateTimeRenderOption: 'FORMATTED_STRING',
      majorDimension: 'ROWS',
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const response = await this.request({
      accessToken,
      method: 'GET',
      retryMode: 'read',
      schema: ValuesResponseSchema,
      ...(signal === undefined ? {} : { signal }),
      url: `${this.sheetsBaseUrl}/spreadsheets/${encodeURIComponent(
        spreadsheetId,
      )}/values/${encodeURIComponent(range)}?${query}`,
    });
    return { range: response.range, values: response.values };
  }

  async append(
    accessToken: string,
    connectionId: string,
    spreadsheetIdInput: string,
    rangeInput: string,
    valuesInput: GoogleValueRows,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<GoogleWriteResult> {
    const spreadsheetId = SpreadsheetIdSchema.parse(spreadsheetIdInput);
    const range = RangeSchema.parse(rangeInput);
    const values = RowsSchema.parse(valuesInput);
    const body = { majorDimension: 'ROWS', values };
    const query = new URLSearchParams({
      includeValuesInResponse: 'false',
      insertDataOption: 'INSERT_ROWS',
      valueInputOption: 'RAW',
    });
    return await this.idempotentWrite(
      connectionId,
      idempotencyKey,
      { body, operation: 'append', range, spreadsheetId },
      async () =>
        normalizedAppendResult(
          await this.request({
            accessToken,
            body,
            method: 'POST',
            retryMode: 'append',
            schema: AppendResponseSchema,
            ...(signal === undefined ? {} : { signal }),
            url: `${this.sheetsBaseUrl}/spreadsheets/${encodeURIComponent(
              spreadsheetId,
            )}/values/${encodeURIComponent(range)}:append?${query}`,
          }),
        ),
    );
  }

  async batchUpdate(
    accessToken: string,
    connectionId: string,
    spreadsheetIdInput: string,
    dataInput: readonly { readonly range: string; readonly values: GoogleValueRows }[],
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<GoogleWriteResult> {
    const spreadsheetId = SpreadsheetIdSchema.parse(spreadsheetIdInput);
    if (dataInput.length === 0 || dataInput.length > 100) {
      throw new GoogleSheetsError(
        'GOOGLE_REQUEST_INVALID',
        'Google Sheets batch update requires between 1 and 100 ranges.',
      );
    }
    const data = dataInput.map((item) => ({
      majorDimension: 'ROWS' as const,
      range: RangeSchema.parse(item.range),
      values: RowsSchema.parse(item.values),
    }));
    const body = {
      data,
      includeValuesInResponse: false,
      valueInputOption: 'RAW',
    };
    return await this.idempotentWrite(
      connectionId,
      idempotencyKey,
      { body, operation: 'batchUpdate', spreadsheetId },
      async () =>
        normalizedBatchResult(
          await this.request({
            accessToken,
            body,
            method: 'POST',
            retryMode: 'idempotent',
            schema: BatchUpdateResponseSchema,
            ...(signal === undefined ? {} : { signal }),
            url: `${this.sheetsBaseUrl}/spreadsheets/${encodeURIComponent(
              spreadsheetId,
            )}/values:batchUpdate`,
          }),
        ),
    );
  }

  async sync(
    accessToken: string,
    connectionId: string,
    spreadsheetId: string,
    range: string,
    input: GoogleSyncInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<GoogleWriteResult> {
    const existing = await this.read(accessToken, spreadsheetId, range, signal);
    const merged = mergeSyncRows(existing.values, input);
    const padded = [
      ...merged,
      ...Array.from({ length: Math.max(0, existing.values.length - merged.length) }, () =>
        input.headers.map(() => ''),
      ),
    ];
    return await this.batchUpdate(
      accessToken,
      connectionId,
      spreadsheetId,
      [{ range, values: padded }],
      idempotencyKey,
      signal,
    );
  }

  private async idempotentWrite(
    connectionId: string,
    idempotencyKey: string,
    request: unknown,
    operation: () => Promise<GoogleWriteResult>,
  ): Promise<GoogleWriteResult> {
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey)) {
      throw new GoogleSheetsError(
        'GOOGLE_REQUEST_INVALID',
        'The Google operation idempotency key is invalid.',
      );
    }
    const hash = requestHash(request);
    const claim = await this.operationStore.claim(connectionId, idempotencyKey, hash);
    if (typeof claim === 'object') {
      return structuredClone(claim.result);
    }
    if (claim !== 'claimed') {
      throw new GoogleSheetsError(
        'GOOGLE_IDEMPOTENCY_CONFLICT',
        'The Google operation is already active, ambiguous, or has different input.',
      );
    }
    try {
      const result = await operation();
      await this.operationStore.complete(connectionId, idempotencyKey, hash, result);
      return result;
    } catch (error) {
      if (error instanceof GoogleSheetsError && error.code === 'GOOGLE_REQUEST_AMBIGUOUS') {
        await this.operationStore.markAmbiguous(connectionId, idempotencyKey, hash);
      } else {
        await this.operationStore.release(connectionId, idempotencyKey, hash);
      }
      throw error;
    }
  }

  private async request<T>(options: RequestOptions<T>): Promise<T> {
    if (options.accessToken.length < 20 || options.accessToken.length > 20_000) {
      throw new GoogleSheetsError(
        'GOOGLE_AUTHORIZATION_INVALID',
        'The Google access token is invalid.',
      );
    }
    const encodedBody = options.body === undefined ? undefined : JSON.stringify(options.body);
    if (
      encodedBody !== undefined &&
      new TextEncoder().encode(encodedBody).byteLength > MAX_REQUEST_BYTES
    ) {
      throw new GoogleSheetsError(
        'GOOGLE_REQUEST_INVALID',
        'The Google Sheets request exceeds the 2 MB safety limit.',
      );
    }
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchTransport(options.url, {
          ...(encodedBody === undefined ? {} : { body: encodedBody }),
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${options.accessToken}`,
            ...(encodedBody === undefined ? {} : { 'content-type': 'application/json' }),
          },
          method: options.method,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
      } catch (error) {
        if (options.retryMode === 'append') {
          throw new GoogleSheetsError(
            'GOOGLE_REQUEST_AMBIGUOUS',
            'The Google append result is unknown and will not be retried automatically.',
            { cause: error },
          );
        }
        if (attempt === maxAttempts - 1) {
          throw new GoogleSheetsError(
            'GOOGLE_REQUEST_FAILED',
            'Google Sheets could not be reached after bounded retries.',
            { cause: error, retryable: true },
          );
        }
        await this.backoff(attempt, undefined);
        continue;
      }
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
        throw new GoogleSheetsError(
          'GOOGLE_RESPONSE_INVALID',
          'Google Sheets returned an oversized response.',
        );
      }
      if (response.ok) {
        let value: unknown;
        try {
          value = JSON.parse(text) as unknown;
        } catch {
          throw new GoogleSheetsError(
            'GOOGLE_RESPONSE_INVALID',
            'Google Sheets returned invalid JSON.',
          );
        }
        const parsed = options.schema.safeParse(value);
        if (!parsed.success) {
          throw new GoogleSheetsError(
            'GOOGLE_RESPONSE_INVALID',
            'Google Sheets returned an unexpected response envelope.',
          );
        }
        return parsed.data;
      }
      const canRetry =
        RETRYABLE_STATUS.has(response.status) &&
        (options.retryMode !== 'append' || response.status === 429);
      if (canRetry && attempt < maxAttempts - 1) {
        await this.backoff(attempt, response.headers.get('retry-after') ?? undefined);
        continue;
      }
      if (options.retryMode === 'append' && response.status >= 500) {
        throw new GoogleSheetsError(
          'GOOGLE_REQUEST_AMBIGUOUS',
          'The Google append result is unknown and will not be retried automatically.',
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new GoogleSheetsError(
          'GOOGLE_AUTHORIZATION_INVALID',
          'Google rejected the connection authorization.',
        );
      }
      if (response.status === 429) {
        throw new GoogleSheetsError(
          'GOOGLE_RATE_LIMITED',
          'Google Sheets rate limits were exceeded after bounded retries.',
          { retryable: true },
        );
      }
      throw new GoogleSheetsError('GOOGLE_REQUEST_FAILED', 'Google Sheets rejected the request.', {
        retryable: response.status >= 500,
      });
    }
    throw new GoogleSheetsError('GOOGLE_REQUEST_FAILED', 'Google Sheets request failed.', {
      retryable: true,
    });
  }

  private async backoff(attempt: number, retryAfter: string | undefined): Promise<void> {
    const retryAfterSeconds = retryAfter === undefined ? Number.NaN : Number(retryAfter);
    const exponential = Math.min(32_000, 2 ** attempt * 1_000 + this.random() * 1_000);
    const milliseconds = Number.isFinite(retryAfterSeconds)
      ? Math.min(32_000, Math.max(exponential, retryAfterSeconds * 1_000))
      : exponential;
    await this.sleep(milliseconds);
  }
}
