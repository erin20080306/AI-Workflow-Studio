import { describe, expect, it } from 'vitest';

import { driveWorkbookProgressForRunStep } from './run-drive-workbook-progress';

describe('driveWorkbookProgressForRunStep', () => {
  it('shows scanning while a running Drive step has not persisted discovery', () => {
    expect(
      driveWorkbookProgressForRunStep({
        nodeType: 'google_drive.read_excel_folder',
        outputSummary: {},
        status: 'running',
      }),
    ).toEqual({ phase: 'scanning' });
  });

  it('projects only a bounded workbook total from the persisted checkpoint', () => {
    const progress = driveWorkbookProgressForRunStep({
      nodeType: 'google_drive.read_excel_folder',
      outputSummary: {
        files: [{ fileName: 'private-result.xlsx' }],
        kind: 'google_drive_excel_checkpoint',
        manifest: {
          files: [
            { id: 'private-id-1', name: 'private-source-1.xlsx' },
            { id: 'private-id-2', name: 'private-source-2.xlsx' },
          ],
          folderId: 'private-folder-id',
        },
        rows: [{ customer: 'private row value' }],
      },
      status: 'running',
    });

    expect(progress).toEqual({ phase: 'batching', totalWorkbookCount: 2 });
    expect(JSON.stringify(progress)).not.toContain('private');
  });

  it('fails closed to scanning for an unbounded or malformed checkpoint', () => {
    expect(
      driveWorkbookProgressForRunStep({
        nodeType: 'google_drive.read_excel_folder',
        outputSummary: {
          kind: 'google_drive_excel_checkpoint',
          manifest: { files: Array.from({ length: 501 }, () => ({})) },
        },
        status: 'running',
      }),
    ).toEqual({ phase: 'scanning' });
    expect(
      driveWorkbookProgressForRunStep({
        nodeType: 'google_drive.read_excel_folder',
        outputSummary: {},
        status: 'succeeded',
      }),
    ).toBeUndefined();
  });

  it('projects only a count total from running local Excel batch progress', () => {
    expect(
      driveWorkbookProgressForRunStep({
        nodeType: 'excel.read',
        outputSummary: { kind: 'workbook_batch', totalWorkbookCount: 481 },
        status: 'running',
      }),
    ).toEqual({ phase: 'batching', totalWorkbookCount: 481 });
    expect(
      driveWorkbookProgressForRunStep({
        nodeType: 'excel.read',
        outputSummary: {
          fileNames: ['private-ledger.xls'],
          kind: 'workbook_batch',
          totalWorkbookCount: 481,
        },
        status: 'running',
      }),
    ).toBeUndefined();
  });
});
