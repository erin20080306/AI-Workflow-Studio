import type {
  DriveExcelFolderManifest,
  DriveExcelFolderResult,
  DriveExcelReadOptions,
} from '@ai-workflow-studio/google-sheets';
import { z } from 'zod';

const GoogleResourceIdSchema = z
  .string()
  .min(8)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/);
const GoogleCellSchema = z.union([z.boolean(), z.null(), z.number(), z.string()]);
const MAX_CHECKPOINT_CHARACTERS = 16_000_000;
export const DRIVE_EXCEL_BATCH_SIZE = 40;

export const DriveExcelReadConfigSchema = z
  .object({
    connectionId: z.string().uuid(),
    folderId: GoogleResourceIdSchema,
    headerScanRows: z.number().int().min(1).max(100),
    includeSubfolders: z.boolean(),
    maxFileSizeBytes: z.number().int().min(1).max(20_000_000),
    maxFiles: z.number().int().min(1).max(500),
    maxRows: z.number().int().min(1).max(100_000),
    maxSheets: z.number().int().min(1).max(2_000),
  })
  .strict();

const ManifestSchema = z
  .object({
    files: z
      .array(
        z
          .object({
            id: GoogleResourceIdSchema,
            mimeType: z.string().trim().min(1).max(300),
            name: z.string().trim().min(1).max(1_000),
            size: z.number().int().nonnegative().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    folderId: GoogleResourceIdSchema,
    kind: z.literal('google_drive_excel_manifest'),
  })
  .strict();

const SourceSchema = z
  .object({
    fileId: GoogleResourceIdSchema,
    fileName: z.string().trim().min(1).max(1_000),
    rowCount: z.number().int().nonnegative(),
    sheetCount: z.number().int().nonnegative(),
  })
  .strict();

export const DriveExcelFolderOutputSchema = z
  .object({
    columns: z.array(z.string().min(1).max(200)).min(2).max(1_000),
    files: z.array(SourceSchema).min(1).max(500),
    folderId: GoogleResourceIdSchema,
    kind: z.literal('google_drive_excel_folder'),
    rows: z.array(z.record(z.string().min(1).max(200), GoogleCellSchema)).max(100_000),
  })
  .strict();

export const DriveExcelCheckpointSchema = z
  .object({
    columns: z.array(z.string().min(1).max(200)).min(2).max(1_000),
    files: z.array(SourceSchema).max(500),
    kind: z.literal('google_drive_excel_checkpoint'),
    manifest: ManifestSchema,
    nextFileIndex: z.number().int().min(0).max(500),
    rows: z.array(z.record(z.string().min(1).max(200), GoogleCellSchema)).max(100_000),
  })
  .strict();

export type DriveExcelCheckpoint = z.infer<typeof DriveExcelCheckpointSchema>;
export type DriveExcelReadConfig = z.infer<typeof DriveExcelReadConfigSchema>;

function readOptions(config: DriveExcelReadConfig): DriveExcelReadOptions {
  return {
    headerScanRows: config.headerScanRows,
    includeSubfolders: config.includeSubfolders,
    maxFileSizeBytes: config.maxFileSizeBytes,
    maxFiles: config.maxFiles,
    maxRows: config.maxRows,
    maxSheets: config.maxSheets,
  };
}

export function driveExcelReadOptions(config: unknown): DriveExcelReadOptions {
  return readOptions(DriveExcelReadConfigSchema.parse(config));
}

export function createDriveExcelCheckpoint(
  manifestInput: DriveExcelFolderManifest,
): DriveExcelCheckpoint {
  const manifest = ManifestSchema.parse(manifestInput);
  return DriveExcelCheckpointSchema.parse({
    columns: ['_source_file', '_source_sheet'],
    files: [],
    kind: 'google_drive_excel_checkpoint',
    manifest,
    nextFileIndex: 0,
    rows: [],
  });
}

export function nextDriveExcelBatchManifest(
  checkpointInput: DriveExcelCheckpoint,
  batchSize = DRIVE_EXCEL_BATCH_SIZE,
): DriveExcelFolderManifest | undefined {
  const checkpoint = DriveExcelCheckpointSchema.parse(checkpointInput);
  const parsedBatchSize = z.number().int().min(1).max(100).parse(batchSize);
  if (checkpoint.nextFileIndex >= checkpoint.manifest.files.length) return undefined;
  return {
    files: checkpoint.manifest.files
      .slice(checkpoint.nextFileIndex, checkpoint.nextFileIndex + parsedBatchSize)
      .map((file) => ({
        id: file.id,
        mimeType: file.mimeType,
        name: file.name,
        ...(file.size === undefined ? {} : { size: file.size }),
      })),
    folderId: checkpoint.manifest.folderId,
    kind: 'google_drive_excel_manifest',
  };
}

export function mergeDriveExcelCheckpoint(
  checkpointInput: DriveExcelCheckpoint,
  batchInput: DriveExcelFolderResult,
  configInput: unknown,
): DriveExcelCheckpoint {
  const checkpoint = DriveExcelCheckpointSchema.parse(checkpointInput);
  const config = DriveExcelReadConfigSchema.parse(configInput);
  const batch = DriveExcelFolderOutputSchema.parse(batchInput);
  if (batch.files.length > 100) {
    throw new Error('Drive Excel batch exceeds the bounded per-invocation file limit.');
  }
  const expectedFiles = checkpoint.manifest.files.slice(
    checkpoint.nextFileIndex,
    checkpoint.nextFileIndex + batch.files.length,
  );
  if (
    batch.folderId !== checkpoint.manifest.folderId ||
    expectedFiles.length !== batch.files.length ||
    batch.files.some((file, index) => file.fileId !== expectedFiles[index]?.id)
  ) {
    throw new Error('Drive Excel batch does not match the durable checkpoint cursor.');
  }
  const rows = [...checkpoint.rows, ...batch.rows];
  const files = [...checkpoint.files, ...batch.files];
  const sheetCount = files.reduce((total, file) => total + file.sheetCount, 0);
  if (rows.length > config.maxRows || sheetCount > config.maxSheets) {
    throw new Error('Drive Excel checkpoint exceeds the reviewed row or worksheet limit.');
  }
  const columns = [...checkpoint.columns];
  const knownColumns = new Set(columns);
  for (const column of batch.columns) {
    if (!knownColumns.has(column)) {
      knownColumns.add(column);
      columns.push(column);
    }
  }
  const merged = DriveExcelCheckpointSchema.parse({
    columns,
    files,
    kind: 'google_drive_excel_checkpoint',
    manifest: checkpoint.manifest,
    nextFileIndex: checkpoint.nextFileIndex + batch.files.length,
    rows,
  });
  if (JSON.stringify(merged).length > MAX_CHECKPOINT_CHARACTERS) {
    throw new Error('Drive Excel checkpoint exceeds the bounded durable-state limit.');
  }
  return merged;
}

export function completedDriveExcelOutput(
  checkpointInput: DriveExcelCheckpoint,
): DriveExcelFolderResult | undefined {
  const checkpoint = DriveExcelCheckpointSchema.parse(checkpointInput);
  if (checkpoint.nextFileIndex !== checkpoint.manifest.files.length) return undefined;
  return {
    columns: checkpoint.columns,
    files: checkpoint.files,
    folderId: checkpoint.manifest.folderId,
    kind: 'google_drive_excel_folder',
    rows: checkpoint.rows,
  };
}
