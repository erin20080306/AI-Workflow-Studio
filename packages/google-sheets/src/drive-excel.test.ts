import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';

import { GoogleSheetsClient, InMemoryGoogleOperationStore } from './client';
import { GoogleDriveExcelClient } from './drive-excel';
import type { GoogleFetch } from './types';

const TOKEN = 'google-access-token-for-drive-excel-tests';
const FOLDER_ID = '1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ';

describe('GoogleDriveExcelClient', () => {
  it('downloads native XLSX files and exports Google Sheets with the bounded XLSX MIME', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4]);
    const calls: string[] = [];
    const fetchTransport: GoogleFetch = async (input) => {
      calls.push(String(input));
      return new Response(bytes);
    };
    const client = new GoogleDriveExcelClient({ fetchTransport });

    const native = await client.downloadExcelManifestFile(
      TOKEN,
      {
        id: '1NativeWorkbookResource12345',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        name: 'native.xlsx',
        size: bytes.byteLength,
      },
      1_000,
    );
    const sheet = await client.downloadExcelManifestFile(
      TOKEN,
      {
        id: '1GoogleSheetResource1234567',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        name: 'sheet',
      },
      1_000,
    );

    expect(native.fileName).toBe('native.xlsx');
    expect(sheet.fileName).toBe('sheet.xlsx');
    expect(calls[0]).toContain('alt=media');
    expect(calls[1]).toContain('/export?mimeType=');
    expect(calls[1]).toContain(
      encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    );
  });

  it('transfers legacy XLS directly and rejects oversized workbooks before transfer', async () => {
    const legacyBytes = new Uint8Array([208, 207, 17, 224]);
    const fetchTransport = vi.fn<GoogleFetch>(async () => new Response(legacyBytes));
    const client = new GoogleDriveExcelClient({ fetchTransport });

    await expect(
      client.downloadExcelManifestFile(
        TOKEN,
        {
          id: '1LegacyWorkbookResource123456',
          mimeType: 'application/vnd.ms-excel',
          name: 'legacy.xls',
          size: 100,
        },
        1_000,
      ),
    ).resolves.toMatchObject({
      bytes: legacyBytes,
      fileName: 'legacy.xls',
      mimeType: 'application/vnd.ms-excel',
    });
    await expect(
      client.downloadExcelManifestFile(
        TOKEN,
        {
          id: '1OversizedWorkbookResource1234',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          name: 'oversized.xlsx',
          size: 1_001,
        },
        1_000,
      ),
    ).rejects.toMatchObject({ code: 'GOOGLE_REQUEST_INVALID' });
    expect(fetchTransport).toHaveBeenCalledTimes(1);
  });

  it('discovers a Drive spreadsheet, finds its header, and consolidates source rows', async () => {
    const fetchTransport: GoogleFetch = async (input) => {
      const url = String(input);
      if (url.includes('/drive/v3/files?')) {
        return Response.json({
          files: [
            {
              id: '1SpreadsheetResourceId123456',
              mimeType: 'application/vnd.google-apps.spreadsheet',
              name: '成本資料.xlsx',
            },
          ],
        });
      }
      if (url.includes('/spreadsheets/1SpreadsheetResourceId123456?')) {
        return Response.json({
          sheets: [
            {
              properties: {
                gridProperties: { columnCount: 3, rowCount: 5 },
                sheetId: 0,
                title: '成本',
              },
            },
          ],
        });
      }
      if (url.includes('/values/')) {
        return Response.json({
          range: "'成本'!A1:C5",
          values: [['成本報價表'], ['品號', '數量', '成本'], ['A-01', 2, 120], ['B-02', 3, 450]],
        });
      }
      return new Response('not found', { status: 404 });
    };
    const sheetsClient = new GoogleSheetsClient({
      fetchTransport,
      operationStore: new InMemoryGoogleOperationStore(),
    });
    const client = new GoogleDriveExcelClient({ fetchTransport, sheetsClient });

    const result = await client.readExcelFolder(TOKEN, FOLDER_ID, {
      headerScanRows: 10,
      includeSubfolders: true,
      maxFileSizeBytes: 5_000_000,
      maxFiles: 10,
      maxRows: 100,
      maxSheets: 10,
    });

    expect(result.columns).toEqual(['_source_file', '_source_sheet', '品號', '數量', '成本']);
    expect(result.rows).toEqual([
      {
        _source_file: '成本資料.xlsx',
        _source_sheet: '成本',
        品號: 'A-01',
        數量: 2,
        成本: 120,
      },
      {
        _source_file: '成本資料.xlsx',
        _source_sheet: '成本',
        品號: 'B-02',
        數量: 3,
        成本: 450,
      },
    ]);
  });

  it('parses a downloaded XLSX locally without creating a temporary Google Sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('成本');
    worksheet.addRows([
      ['成本報價表'],
      ['品號', '數量', '成本'],
      [{ richText: [{ text: 'A-' }, { font: { bold: true }, text: '01' }] }, 2],
    ]);
    worksheet.getCell('C3').value = { formula: 'B3*60', result: 120 };
    worksheet.getCell('A3').fill = {
      fgColor: { argb: 'FFFF0000' },
      pattern: 'solid',
      type: 'pattern',
    };
    const workbookBytes = await workbook.xlsx.writeBuffer();
    const calls: string[] = [];
    const fetchTransport: GoogleFetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('alt=media')) return new Response(workbookBytes);
      if (url.includes('/drive/v3/files?')) {
        return Response.json({
          files: [
            {
              id: '1BinaryWorkbookResourceId12345',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              name: '成本資料.xlsx',
              size: String(workbookBytes.byteLength),
            },
          ],
        });
      }
      return new Response('not found', { status: 404 });
    };
    const client = new GoogleDriveExcelClient({ fetchTransport });

    const result = await client.readExcelFolder(TOKEN, FOLDER_ID, {
      headerScanRows: 10,
      includeSubfolders: true,
      maxFileSizeBytes: 5_000_000,
      maxFiles: 10,
      maxRows: 100,
      maxSheets: 10,
    });

    expect(result.rows).toEqual([
      {
        _source_file: '成本資料.xlsx',
        _source_sheet: '成本',
        品號: 'A-01',
        數量: 2,
        成本: 120,
      },
    ]);
    expect(calls.some((call) => call.includes('/upload/'))).toBe(false);
  });

  it('fails closed when a downloaded workbook is not a valid XLSX archive', async () => {
    const invalidWorkbook = new Uint8Array([1, 2, 3, 4]);
    const fetchTransport: GoogleFetch = async (input) => {
      const url = String(input);
      if (url.includes('alt=media')) return new Response(invalidWorkbook);
      if (url.includes('/drive/v3/files?')) {
        return Response.json({
          files: [
            {
              id: '1InvalidWorkbookResourceId12345',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              name: 'invalid.xlsx',
              size: String(invalidWorkbook.byteLength),
            },
          ],
        });
      }
      return new Response('not found', { status: 404 });
    };
    const client = new GoogleDriveExcelClient({ fetchTransport });

    await expect(
      client.readExcelFolder(TOKEN, FOLDER_ID, {
        headerScanRows: 10,
        includeSubfolders: true,
        maxFileSizeBytes: 20_000_000,
        maxFiles: 10,
        maxRows: 100,
        maxSheets: 10,
      }),
    ).rejects.toMatchObject({ code: 'GOOGLE_REQUEST_INVALID' });
  });

  it('bounds concurrent XLSX downloads and preserves deterministic file order', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('成本').addRows([
      ['品號', '成本'],
      ['A-01', 120],
    ]);
    const workbookBytes = await workbook.xlsx.writeBuffer();
    let activeDownloads = 0;
    let maximumDownloads = 0;
    const fetchTransport: GoogleFetch = async (input) => {
      const url = String(input);
      if (url.includes('alt=media')) {
        activeDownloads += 1;
        maximumDownloads = Math.max(maximumDownloads, activeDownloads);
        await Promise.resolve();
        activeDownloads -= 1;
        return new Response(workbookBytes);
      }
      if (url.includes('/drive/v3/files?')) {
        return Response.json({
          files: Array.from({ length: 20 }, (_, index) => ({
            id: `1BinaryWorkbookResourceId${String(index).padStart(3, '0')}`,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            name: `成本-${String(19 - index).padStart(2, '0')}.xlsx`,
            size: String(workbookBytes.byteLength),
          })),
        });
      }
      return new Response('not found', { status: 404 });
    };
    const client = new GoogleDriveExcelClient({ fetchTransport });

    const result = await client.readExcelFolder(TOKEN, FOLDER_ID, {
      headerScanRows: 10,
      includeSubfolders: true,
      maxFileSizeBytes: 5_000_000,
      maxFiles: 20,
      maxRows: 100,
      maxSheets: 20,
    });

    expect(maximumDownloads).toBeGreaterThan(1);
    expect(maximumDownloads).toBeLessThanOrEqual(24);
    expect(result.files.map((file) => file.fileName)).toEqual(
      Array.from({ length: 20 }, (_, index) => `成本-${String(index).padStart(2, '0')}.xlsx`),
    );
  });

  it('streams the maximum bounded workbook count without full workbook models', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('成本').addRows([
      ['品號', '成本'],
      ['A-01', 120],
    ]);
    const workbookBytes = await workbook.xlsx.writeBuffer();
    const fetchTransport: GoogleFetch = async (input) => {
      const url = String(input);
      if (url.includes('alt=media')) return new Response(workbookBytes);
      if (url.includes('/drive/v3/files?')) {
        return Response.json({
          files: Array.from({ length: 500 }, (_, index) => ({
            id: `1BoundedWorkbookResource${String(index).padStart(3, '0')}`,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            name: `成本-${String(index).padStart(3, '0')}.xlsx`,
            size: String(workbookBytes.byteLength),
          })),
        });
      }
      return new Response('not found', { status: 404 });
    };
    const client = new GoogleDriveExcelClient({ fetchTransport });

    const result = await client.readExcelFolder(TOKEN, FOLDER_ID, {
      headerScanRows: 10,
      includeSubfolders: true,
      maxFileSizeBytes: 20_000_000,
      maxFiles: 500,
      maxRows: 100_000,
      maxSheets: 1_000,
    });

    expect(result.files).toHaveLength(500);
    expect(result.rows).toHaveLength(500);
    expect(result.files[0]?.fileName).toBe('成本-000.xlsx');
    expect(result.files[499]?.fileName).toBe('成本-499.xlsx');
  });

  it('uses a bounded resumable conversion for a legacy XLS workbook larger than 5 MB', async () => {
    const legacyBytes = new Uint8Array(5_000_001);
    const calls: string[] = [];
    const fetchTransport: GoogleFetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('alt=media')) return new Response(legacyBytes);
      if (url.includes('/upload/drive/v3/files?') && init?.method === 'POST') {
        expect(init.headers).toMatchObject({
          'x-upload-content-length': String(legacyBytes.byteLength),
          'x-upload-content-type': 'application/vnd.ms-excel',
        });
        return new Response('', {
          headers: { location: 'https://upload.example.test/resumable/legacy-sheet' },
        });
      }
      if (url === 'https://upload.example.test/resumable/legacy-sheet') {
        return Response.json({
          id: '1ConvertedLegacySpreadsheet1234',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          name: 'AI Workflow Studio temporary legacy.xls',
        });
      }
      if (url.includes('/drive/v3/files?')) {
        return Response.json({
          files: [
            {
              id: '1LegacyWorkbookResourceId12345',
              mimeType: 'application/vnd.ms-excel',
              name: 'legacy.xls',
              size: String(legacyBytes.byteLength),
            },
          ],
        });
      }
      if (url.includes('/spreadsheets/1ConvertedLegacySpreadsheet1234?')) {
        return Response.json({
          sheets: [
            {
              properties: {
                gridProperties: { columnCount: 3, rowCount: 3 },
                sheetId: 0,
                title: '成本',
              },
            },
          ],
        });
      }
      if (url.includes('/values/')) {
        return Response.json({
          range: "'成本'!A1:C3",
          values: [
            ['品號', '數量', '成本'],
            ['A-01', 2, 120],
          ],
        });
      }
      if (url.includes('/drive/v3/files/1ConvertedLegacySpreadsheet1234')) {
        return new Response('', { status: 204 });
      }
      return new Response('not found', { status: 404 });
    };
    const sheetsClient = new GoogleSheetsClient({
      fetchTransport,
      operationStore: new InMemoryGoogleOperationStore(),
    });
    const client = new GoogleDriveExcelClient({ fetchTransport, sheetsClient });

    const result = await client.readExcelFolder(TOKEN, FOLDER_ID, {
      headerScanRows: 10,
      includeSubfolders: true,
      maxFileSizeBytes: 20_000_000,
      maxFiles: 10,
      maxRows: 100,
      maxSheets: 10,
    });

    expect(result.rows).toEqual([
      {
        _source_file: 'legacy.xls',
        _source_sheet: '成本',
        品號: 'A-01',
        數量: 2,
        成本: 120,
      },
    ]);
    expect(calls.some((call) => call.includes('uploadType=resumable'))).toBe(true);
    expect(calls).toContain(
      'DELETE https://www.googleapis.com/drive/v3/files/1ConvertedLegacySpreadsheet1234?supportsAllDrives=true',
    );
  });

  it('creates an idempotent XLSX export without overwriting an existing workbook', async () => {
    const calls: string[] = [];
    let uploadCount = 0;
    const fetchTransport: GoogleFetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/drive/v3/files?') && !url.includes('/upload/')) {
        return Response.json({ files: [] });
      }
      if (url.includes('/upload/drive/v3/files?')) {
        uploadCount += 1;
        return Response.json({
          id: '1FinalExcelReportId123456789',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          name: 'AI-cost-summary.xlsx',
          webViewLink: 'https://drive.google.com/file/d/1FinalExcelReportId123456789/view',
        });
      }
      return new Response('not found', { status: 404 });
    };
    const client = new GoogleDriveExcelClient({ fetchTransport });
    const source = {
      columns: ['_source_file', '_source_sheet', '品號'],
      files: [
        {
          fileId: '1SpreadsheetResourceId123456',
          fileName: '成本資料.xlsx',
          rowCount: 1,
          sheetCount: 1,
        },
      ],
      folderId: FOLDER_ID,
      kind: 'google_drive_excel_folder' as const,
      rows: [{ _source_file: '成本資料.xlsx', _source_sheet: '成本', 品號: 'A-01' }],
    };

    const result = await client.createExcelReport(TOKEN, '10000000-0000-4000-8000-000000000911', {
      ...source,
      idempotencyKey: 'phase49-run-0001:create_report',
      outputName: 'AI-cost-summary.xlsx',
    });

    expect(result).toMatchObject({
      fileName: 'AI-cost-summary.xlsx',
      kind: 'google_drive_excel_report',
      rowCount: 1,
    });
    expect(uploadCount).toBe(1);
    expect(calls.some((call) => call.startsWith('DELETE '))).toBe(false);
  });
});
