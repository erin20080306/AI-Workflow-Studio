import type {
  DriveExcelFolderManifest,
  DriveExcelFolderResult,
} from '@ai-workflow-studio/google-sheets';
import { describe, expect, it } from 'vitest';

import {
  completedDriveExcelOutput,
  createDriveExcelCheckpoint,
  mergeDriveExcelCheckpoint,
  nextDriveExcelBatchManifest,
} from './cloud-drive-excel-checkpoint';

const config = {
  connectionId: '00000000-0000-4000-8000-000000000111',
  folderId: 'DriveFolder123456789',
  headerScanRows: 20,
  includeSubfolders: true,
  maxFileSizeBytes: 20_000_000,
  maxFiles: 500,
  maxRows: 100_000,
  maxSheets: 2_000,
};

const manifest: DriveExcelFolderManifest = {
  files: Array.from({ length: 85 }, (_, index) => ({
    id: `DriveWorkbook${String(index).padStart(4, '0')}`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    name: `成本單-${String(index + 1)}.xlsx`,
    size: 1_024,
  })),
  folderId: config.folderId,
  kind: 'google_drive_excel_manifest',
};

function batchResult(
  batchManifest: DriveExcelFolderManifest,
  start: number,
): DriveExcelFolderResult {
  return {
    columns: ['_source_file', '_source_sheet', '成本'],
    files: batchManifest.files.map((file) => ({
      fileId: file.id,
      fileName: file.name,
      rowCount: 1,
      sheetCount: 1,
    })),
    folderId: batchManifest.folderId,
    kind: 'google_drive_excel_folder',
    rows: batchManifest.files.map((file, index) => ({
      _source_file: file.name,
      _source_sheet: '成本明細',
      成本: start + index + 1,
    })),
  };
}

describe('durable Drive Excel checkpoints', () => {
  it('advances a large manifest in deterministic bounded batches', () => {
    let checkpoint = createDriveExcelCheckpoint(manifest);
    let batchCount = 0;
    while (completedDriveExcelOutput(checkpoint) === undefined) {
      const batch = nextDriveExcelBatchManifest(checkpoint, 40);
      expect(batch).toBeDefined();
      checkpoint = mergeDriveExcelCheckpoint(
        checkpoint,
        batchResult(batch!, checkpoint.nextFileIndex),
        config,
      );
      batchCount += 1;
    }

    const output = completedDriveExcelOutput(checkpoint);
    expect(batchCount).toBe(3);
    expect(output?.files).toHaveLength(85);
    expect(output?.rows).toHaveLength(85);
    expect(output?.rows[84]).toMatchObject({ 成本: 85 });
  });

  it('rejects a batch that does not match the durable manifest cursor', () => {
    const checkpoint = createDriveExcelCheckpoint(manifest);
    const batch = nextDriveExcelBatchManifest(checkpoint, 40)!;
    const mismatched = batchResult(
      {
        ...batch,
        files: [{ ...batch.files[0]!, id: 'DifferentWorkbook123' }, ...batch.files.slice(1)],
      },
      0,
    );

    expect(() => mergeDriveExcelCheckpoint(checkpoint, mismatched, config)).toThrow(
      /checkpoint cursor/,
    );
  });

  it('fails closed when cumulative worksheet limits are exceeded', () => {
    const checkpoint = createDriveExcelCheckpoint(manifest);
    const batch = nextDriveExcelBatchManifest(checkpoint, 2)!;
    const result = batchResult(batch, 0);

    expect(() =>
      mergeDriveExcelCheckpoint(checkpoint, result, { ...config, maxSheets: 1 }),
    ).toThrow(/row or worksheet limit/);
  });
});
