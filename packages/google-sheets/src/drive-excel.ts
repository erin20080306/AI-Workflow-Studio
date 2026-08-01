import { createHash } from 'node:crypto';

import ExcelJS from 'exceljs';
import { z } from 'zod';

import { GoogleSheetsClient, InMemoryGoogleOperationStore } from './client';
import { GoogleSheetsError } from './errors';
import type { GoogleCell, GoogleFetch } from './types';

const GoogleIdSchema = z
  .string()
  .min(8)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/);
const DriveFileSchema = z
  .object({
    id: GoogleIdSchema,
    mimeType: z.string().trim().min(1).max(300),
    name: z.string().trim().min(1).max(1_000),
    size: z.string().regex(/^\d+$/).optional(),
    webViewLink: z.url().max(2_000).optional(),
  })
  .passthrough();
const DriveListSchema = z
  .object({
    files: z.array(DriveFileSchema).max(1_000).default([]),
    nextPageToken: z.string().max(2_000).optional(),
  })
  .passthrough();

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const XLS_MIME = 'application/vnd.ms-excel';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_API_RESPONSE_BYTES = 10_000_000;
const MAX_MULTIPART_BYTES = 5_000_000;
const MAX_RESUMABLE_BYTES = 20_000_000;

export interface DriveExcelSource {
  readonly fileId: string;
  readonly fileName: string;
  readonly rowCount: number;
  readonly sheetCount: number;
}

export interface DriveExcelFolderResult {
  readonly columns: readonly string[];
  readonly files: readonly DriveExcelSource[];
  readonly folderId: string;
  readonly kind: 'google_drive_excel_folder';
  readonly rows: readonly Readonly<Record<string, GoogleCell>>[];
}

export interface DriveExcelReportResult {
  readonly fileId: string;
  readonly fileName: string;
  readonly kind: 'google_drive_excel_report';
  readonly rowCount: number;
  readonly url: string;
}

export interface GoogleDriveExcelClientOptions {
  readonly driveBaseUrl?: string;
  readonly fetchTransport?: GoogleFetch;
  readonly sheetsClient?: GoogleSheetsClient;
  readonly uploadBaseUrl?: string;
}

interface DriveExcelFile {
  readonly id: string;
  readonly mimeType: string;
  readonly name: string;
  readonly size?: number;
}

interface ExcelGrid {
  readonly title: string;
  readonly values: readonly (readonly GoogleCell[])[];
}

function validatedHttpsBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new GoogleSheetsError('GOOGLE_NOT_CONFIGURED', 'Google Drive API URLs must use HTTPS.');
  }
  return url.toString().replace(/\/$/, '');
}

function isExcelFile(file: DriveExcelFile): boolean {
  const name = file.name.toLowerCase();
  return (
    file.mimeType === GOOGLE_SHEET_MIME ||
    file.mimeType === XLS_MIME ||
    file.mimeType === XLSX_MIME ||
    name.endsWith('.xls') ||
    name.endsWith('.xlsx')
  );
}

function normalizedHeader(value: GoogleCell, index: number): string {
  const candidate = String(value ?? '').trim();
  return candidate === '' ? `Column ${index + 1}` : candidate.slice(0, 200);
}

function uniqueHeaders(row: readonly GoogleCell[]): readonly string[] {
  const counts = new Map<string, number>();
  return row.map((value, index) => {
    const base = normalizedHeader(value, index);
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function headerRowIndex(rows: readonly (readonly GoogleCell[])[], scanRows: number): number {
  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < Math.min(scanRows, rows.length); index += 1) {
    const row = rows[index] ?? [];
    const nonEmpty = row.filter((cell) => String(cell ?? '').trim() !== '');
    if (nonEmpty.length < 2) continue;
    const textCells = nonEmpty.filter((cell) => typeof cell === 'string').length;
    const distinct = new Set(nonEmpty.map((cell) => String(cell).trim())).size;
    const score = textCells * 3 + distinct * 2 + nonEmpty.length - index / 100;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

function excelCell(value: ExcelJS.CellValue): GoogleCell {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const candidate = value as unknown as Readonly<Record<string, unknown>>;
  if ('result' in candidate && candidate.result !== undefined) {
    return excelCell(candidate.result as ExcelJS.CellValue);
  }
  if (typeof candidate.text === 'string') return candidate.text;
  if (Array.isArray(candidate.richText)) {
    return candidate.richText
      .map((part) =>
        typeof part === 'object' && part !== null && 'text' in part ? String(part.text) : '',
      )
      .join('');
  }
  if (typeof candidate.error === 'string') return candidate.error;
  return String(value);
}

async function readXlsxGrids(content: Uint8Array): Promise<readonly ExcelGrid[]> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = new ArrayBuffer(content.byteLength);
  new Uint8Array(arrayBuffer).set(content);
  await workbook.xlsx.load(arrayBuffer);
  return workbook.worksheets.map((worksheet) => {
    const values: GoogleCell[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: GoogleCell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        cells[columnNumber - 1] = excelCell(cell.value);
      });
      values.push(cells);
    });
    return { title: worksheet.name, values };
  });
}

async function reportXlsx(input: DriveExcelFolderResult): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI Workflow Studio';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('匯總報表', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  worksheet.columns = input.columns.map((column) => ({
    header: column,
    key: column,
    width: Math.min(42, Math.max(14, column.length + 4)),
  }));
  worksheet.addRows(input.rows.map((row) => ({ ...row })));
  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { pattern: 'solid', type: 'pattern', fgColor: { argb: 'FF172554' } };
  header.alignment = { vertical: 'middle' };
  header.height = 24;
  worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(input.columns.length).letter}1` };
  const content = await workbook.xlsx.writeBuffer();
  return new Uint8Array(content);
}

function multipartBody(
  metadata: unknown,
  mimeType: string,
  content: Uint8Array,
): {
  readonly body: Uint8Array;
  readonly contentType: string;
} {
  const boundary = `ai_workflow_${createHash('sha256')
    .update(JSON.stringify(metadata))
    .update(content)
    .digest('hex')
    .slice(0, 24)}`;
  const prefix = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata,
    )}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(prefix.length + content.length + suffix.length);
  body.set(prefix, 0);
  body.set(content, prefix.length);
  body.set(suffix, prefix.length + content.length);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

export class GoogleDriveExcelClient {
  private readonly driveBaseUrl: string;
  private readonly fetchTransport: GoogleFetch;
  private readonly sheets: GoogleSheetsClient;
  private readonly uploadBaseUrl: string;

  constructor(options: GoogleDriveExcelClientOptions = {}) {
    this.driveBaseUrl = validatedHttpsBaseUrl(
      options.driveBaseUrl ?? 'https://www.googleapis.com/drive/v3',
    );
    this.fetchTransport = options.fetchTransport ?? fetch;
    this.sheets =
      options.sheetsClient ??
      new GoogleSheetsClient({ operationStore: new InMemoryGoogleOperationStore() });
    this.uploadBaseUrl = validatedHttpsBaseUrl(
      options.uploadBaseUrl ?? 'https://www.googleapis.com/upload/drive/v3',
    );
  }

  async readExcelFolder(
    accessToken: string,
    folderIdInput: string,
    input: {
      readonly headerScanRows: number;
      readonly includeSubfolders: boolean;
      readonly maxFileSizeBytes: number;
      readonly maxFiles: number;
      readonly maxRows: number;
      readonly maxSheets: number;
    },
    signal?: AbortSignal,
  ): Promise<DriveExcelFolderResult> {
    const folderId = GoogleIdSchema.parse(folderIdInput);
    const limits = z
      .object({
        headerScanRows: z.number().int().min(1).max(100),
        includeSubfolders: z.boolean(),
        maxFileSizeBytes: z.number().int().min(1).max(20_000_000),
        maxFiles: z.number().int().min(1).max(500),
        maxRows: z.number().int().min(1).max(100_000),
        maxSheets: z.number().int().min(1).max(2_000),
      })
      .strict()
      .parse(input);
    const files = await this.listExcelFiles(accessToken, folderId, limits, signal);
    if (files.length === 0) {
      throw new GoogleSheetsError(
        'GOOGLE_REQUEST_INVALID',
        'The selected Google Drive folder contains no supported Excel workbooks.',
      );
    }

    const columns: string[] = ['_source_file', '_source_sheet'];
    const columnSet = new Set(columns);
    const rows: Readonly<Record<string, GoogleCell>>[] = [];
    const sources: DriveExcelSource[] = [];
    let sheetCount = 0;

    for (const file of files) {
      let spreadsheetId = file.id;
      let temporaryId: string | undefined;
      let localGrids: readonly ExcelGrid[] | undefined;
      try {
        if (file.mimeType !== GOOGLE_SHEET_MIME) {
          if (file.size !== undefined && file.size > limits.maxFileSizeBytes) {
            throw new GoogleSheetsError(
              'GOOGLE_REQUEST_INVALID',
              `Workbook ${file.name} exceeds the configured file-size limit.`,
            );
          }
          const content = await this.downloadFile(
            accessToken,
            file,
            limits.maxFileSizeBytes,
            signal,
          );
          if (file.mimeType !== XLS_MIME && !file.name.toLowerCase().endsWith('.xls')) {
            localGrids = await readXlsxGrids(content);
          } else {
            const converted = await this.uploadFile(
              accessToken,
              {
                appProperties: { aiWorkflowStudioTemporary: 'true' },
                mimeType: GOOGLE_SHEET_MIME,
                name: `AI Workflow Studio temporary ${file.name}`.slice(0, 240),
              },
              XLS_MIME,
              content,
              signal,
            );
            spreadsheetId = converted.id;
            temporaryId = converted.id;
          }
        }

        const grids =
          localGrids ??
          (await this.sheets.listSheets(accessToken, spreadsheetId, signal)).map((sheet) => ({
            spreadsheetId,
            title: sheet.title,
          }));
        if (sheetCount + grids.length > limits.maxSheets) {
          throw new GoogleSheetsError(
            'GOOGLE_REQUEST_INVALID',
            'The Drive folder exceeds the configured worksheet limit.',
          );
        }
        let sourceRows = 0;
        for (const grid of grids) {
          sheetCount += 1;
          const remainingRows = limits.maxRows - rows.length;
          if (remainingRows <= 0) {
            throw new GoogleSheetsError(
              'GOOGLE_REQUEST_INVALID',
              'The Drive folder exceeds the configured consolidated row limit.',
            );
          }
          const values =
            'values' in grid
              ? grid.values
              : (
                  await this.sheets.read(
                    accessToken,
                    grid.spreadsheetId,
                    `'${grid.title.replaceAll("'", "''")}'!A1:ZZ${String(
                      remainingRows + limits.headerScanRows + 1,
                    )}`,
                    signal,
                  )
                ).values;
          if (values.length === 0) continue;
          const headerIndex = headerRowIndex(values, limits.headerScanRows);
          const headers = uniqueHeaders(values[headerIndex] ?? []);
          for (const header of headers) {
            if (!columnSet.has(header)) {
              columnSet.add(header);
              columns.push(header);
            }
          }
          for (const rowValues of values.slice(headerIndex + 1)) {
            if (rowValues.every((value) => String(value ?? '').trim() === '')) continue;
            if (rows.length >= limits.maxRows) {
              throw new GoogleSheetsError(
                'GOOGLE_REQUEST_INVALID',
                'The Drive folder exceeds the configured consolidated row limit.',
              );
            }
            const row: Record<string, GoogleCell> = {
              _source_file: file.name,
              _source_sheet: grid.title,
            };
            headers.forEach((header, index) => {
              row[header] = rowValues[index] ?? null;
            });
            rows.push(row);
            sourceRows += 1;
          }
        }
        sources.push({
          fileId: file.id,
          fileName: file.name,
          rowCount: sourceRows,
          sheetCount: grids.length,
        });
      } finally {
        if (temporaryId !== undefined) {
          await this.deleteFile(accessToken, temporaryId, signal).catch(() => undefined);
        }
      }
    }

    return { columns, files: sources, folderId, kind: 'google_drive_excel_folder', rows };
  }

  async createExcelReport(
    accessToken: string,
    connectionId: string,
    input: DriveExcelFolderResult & {
      readonly idempotencyKey: string;
      readonly outputName: string;
      readonly reportTitle?: string;
    },
    signal?: AbortSignal,
  ): Promise<DriveExcelReportResult> {
    const folderId = GoogleIdSchema.parse(input.folderId);
    const parsed = z
      .object({
        idempotencyKey: z.string().min(8).max(300),
        outputName: z
          .string()
          .trim()
          .min(6)
          .max(180)
          .regex(/\.xlsx$/i),
        reportTitle: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .parse({
        idempotencyKey: input.idempotencyKey,
        outputName: input.outputName,
        ...(input.reportTitle === undefined ? {} : { reportTitle: input.reportTitle }),
      });
    const operationHash = createHash('sha256')
      .update(`${connectionId}:${parsed.idempotencyKey}`)
      .digest('hex');
    const existing = await this.findIdempotentFile(accessToken, folderId, operationHash, signal);
    if (existing !== undefined) {
      return {
        fileId: existing.id,
        fileName: existing.name,
        kind: 'google_drive_excel_report',
        rowCount: input.rows.length,
        url:
          existing.webViewLink ??
          `https://drive.google.com/file/d/${encodeURIComponent(existing.id)}/view`,
      };
    }

    const report = await reportXlsx(input);
    if (report.byteLength > MAX_RESUMABLE_BYTES) {
      throw new GoogleSheetsError(
        'GOOGLE_REQUEST_INVALID',
        'The consolidated Excel report exceeds the bounded upload limit.',
      );
    }
    const created = await this.uploadFile(
      accessToken,
      {
        appProperties: {
          aiWorkflowStudioIdempotencyKey: operationHash,
          aiWorkflowStudioReport: 'true',
        },
        description: parsed.reportTitle,
        mimeType: XLSX_MIME,
        name: parsed.outputName,
        parents: [folderId],
      },
      XLSX_MIME,
      report,
      signal,
    );
    return {
      fileId: created.id,
      fileName: created.name,
      kind: 'google_drive_excel_report',
      rowCount: input.rows.length,
      url:
        created.webViewLink ??
        `https://drive.google.com/file/d/${encodeURIComponent(created.id)}/view`,
    };
  }

  private async listExcelFiles(
    accessToken: string,
    folderId: string,
    limits: { readonly includeSubfolders: boolean; readonly maxFiles: number },
    signal?: AbortSignal,
  ): Promise<readonly DriveExcelFile[]> {
    const folders = [folderId];
    const visited = new Set<string>();
    const files: DriveExcelFile[] = [];
    while (folders.length > 0) {
      const current = folders.shift();
      if (current === undefined || visited.has(current)) continue;
      visited.add(current);
      if (visited.size > 500) {
        throw new GoogleSheetsError(
          'GOOGLE_REQUEST_INVALID',
          'The Drive folder exceeds the bounded subfolder limit.',
        );
      }
      let pageToken: string | undefined;
      do {
        const query = new URLSearchParams({
          fields: 'nextPageToken,files(id,name,mimeType,size,webViewLink)',
          includeItemsFromAllDrives: 'true',
          pageSize: '1000',
          q: `'${current}' in parents and trashed=false`,
          spaces: 'drive',
          supportsAllDrives: 'true',
          ...(pageToken === undefined ? {} : { pageToken }),
        });
        const page = await this.jsonRequest(
          accessToken,
          `${this.driveBaseUrl}/files?${query}`,
          { method: 'GET' },
          DriveListSchema,
          signal,
        );
        for (const file of page.files) {
          if (file.mimeType === DRIVE_FOLDER_MIME) {
            if (limits.includeSubfolders) folders.push(file.id);
            continue;
          }
          const candidate: DriveExcelFile = {
            id: file.id,
            mimeType: file.mimeType,
            name: file.name,
            ...(file.size === undefined ? {} : { size: Number(file.size) }),
          };
          if (!isExcelFile(candidate)) continue;
          files.push(candidate);
          if (files.length > limits.maxFiles) {
            throw new GoogleSheetsError(
              'GOOGLE_REQUEST_INVALID',
              'The Drive folder exceeds the configured workbook limit.',
            );
          }
        }
        pageToken = page.nextPageToken;
      } while (pageToken !== undefined);
    }
    return files.sort((left, right) => left.name.localeCompare(right.name));
  }

  private async downloadFile(
    accessToken: string,
    file: DriveExcelFile,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return await this.binaryRequest(
      accessToken,
      `${this.driveBaseUrl}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`,
      { method: 'GET' },
      maxBytes,
      signal,
    );
  }

  private async uploadFile(
    accessToken: string,
    metadata: unknown,
    mimeType: string,
    content: Uint8Array,
    signal?: AbortSignal,
  ): Promise<z.infer<typeof DriveFileSchema>> {
    if (content.byteLength > MAX_RESUMABLE_BYTES) {
      throw new GoogleSheetsError('GOOGLE_REQUEST_INVALID', 'Drive upload exceeds 20 MB.');
    }
    if (content.byteLength > MAX_MULTIPART_BYTES) {
      return await this.uploadResumable(accessToken, metadata, mimeType, content, signal);
    }
    const multipart = multipartBody(metadata, mimeType, content);
    return await this.jsonRequest(
      accessToken,
      `${this.uploadBaseUrl}/files?${new URLSearchParams({
        fields: 'id,name,mimeType,webViewLink',
        supportsAllDrives: 'true',
        uploadType: 'multipart',
      })}`,
      {
        body: multipart.body.buffer as ArrayBuffer,
        headers: { 'content-type': multipart.contentType },
        method: 'POST',
      },
      DriveFileSchema,
      signal,
    );
  }

  private async uploadResumable(
    accessToken: string,
    metadata: unknown,
    mimeType: string,
    content: Uint8Array,
    signal?: AbortSignal,
  ): Promise<z.infer<typeof DriveFileSchema>> {
    const initiation = await this.fetchTransport(
      `${this.uploadBaseUrl}/files?${new URLSearchParams({
        fields: 'id,name,mimeType,webViewLink',
        supportsAllDrives: 'true',
        uploadType: 'resumable',
      })}`,
      {
        body: JSON.stringify(metadata),
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-length': String(content.byteLength),
          'x-upload-content-type': mimeType,
        },
        method: 'POST',
        ...(signal === undefined ? {} : { signal }),
      },
    );
    if (!initiation.ok) {
      throw new GoogleSheetsError(
        initiation.status === 429 ? 'GOOGLE_RATE_LIMITED' : 'GOOGLE_REQUEST_FAILED',
        'Google Drive rejected resumable-upload initialization.',
        { retryable: initiation.status === 429 || initiation.status >= 500 },
      );
    }
    const location = initiation.headers.get('location');
    const parsedLocation = z.url().max(2_000).safeParse(location);
    if (!parsedLocation.success || new URL(parsedLocation.data).protocol !== 'https:') {
      throw new GoogleSheetsError(
        'GOOGLE_RESPONSE_INVALID',
        'Google Drive returned an invalid resumable-upload location.',
      );
    }
    return await this.jsonRequest(
      accessToken,
      parsedLocation.data,
      {
        body: content.buffer.slice(
          content.byteOffset,
          content.byteOffset + content.byteLength,
        ) as ArrayBuffer,
        headers: {
          'content-length': String(content.byteLength),
          'content-type': mimeType,
        },
        method: 'PUT',
      },
      DriveFileSchema,
      signal,
    );
  }

  private async findIdempotentFile(
    accessToken: string,
    folderId: string,
    operationHash: string,
    signal?: AbortSignal,
  ): Promise<z.infer<typeof DriveFileSchema> | undefined> {
    const query = new URLSearchParams({
      fields: 'files(id,name,mimeType,webViewLink)',
      pageSize: '2',
      q: `'${folderId}' in parents and trashed=false and appProperties has { key='aiWorkflowStudioIdempotencyKey' and value='${operationHash}' }`,
      spaces: 'drive',
    });
    const response = await this.jsonRequest(
      accessToken,
      `${this.driveBaseUrl}/files?${query}`,
      { method: 'GET' },
      DriveListSchema,
      signal,
    );
    return response.files[0];
  }

  private async deleteFile(
    accessToken: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await this.fetchTransport(
      `${this.driveBaseUrl}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      {
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'DELETE',
        ...(signal === undefined ? {} : { signal }),
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new GoogleSheetsError(
        response.status === 429 ? 'GOOGLE_RATE_LIMITED' : 'GOOGLE_REQUEST_FAILED',
        'Google Drive rejected temporary-file cleanup.',
        { retryable: response.status === 429 || response.status >= 500 },
      );
    }
  }

  private async jsonRequest<T>(
    accessToken: string,
    url: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.fetchTransport(url, {
      ...init,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {}),
      },
      ...(signal === undefined ? {} : { signal }),
    });
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_API_RESPONSE_BYTES) {
      throw new GoogleSheetsError('GOOGLE_RESPONSE_INVALID', 'Google Drive response is oversized.');
    }
    if (!response.ok) {
      throw new GoogleSheetsError(
        response.status === 429 ? 'GOOGLE_RATE_LIMITED' : 'GOOGLE_REQUEST_FAILED',
        'Google Drive rejected the request.',
        { retryable: response.status === 429 || response.status >= 500 },
      );
    }
    let json: unknown;
    try {
      json = text === '' ? {} : JSON.parse(text);
    } catch (error) {
      throw new GoogleSheetsError(
        'GOOGLE_RESPONSE_INVALID',
        'Google Drive returned invalid JSON.',
        {
          cause: error,
        },
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new GoogleSheetsError('GOOGLE_RESPONSE_INVALID', 'Google Drive response is invalid.');
    }
    return parsed.data;
  }

  private async binaryRequest(
    accessToken: string,
    url: string,
    init: RequestInit,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const response = await this.fetchTransport(url, {
      ...init,
      headers: { authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) {
      throw new GoogleSheetsError(
        response.status === 429 ? 'GOOGLE_RATE_LIMITED' : 'GOOGLE_REQUEST_FAILED',
        'Google Drive rejected the file transfer.',
        { retryable: response.status === 429 || response.status >= 500 },
      );
    }
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new GoogleSheetsError('GOOGLE_RESPONSE_INVALID', 'Google Drive file is oversized.');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new GoogleSheetsError('GOOGLE_RESPONSE_INVALID', 'Google Drive file is oversized.');
    }
    return bytes;
  }
}
