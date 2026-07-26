import { ProcessingLedger, hashFile } from '@ai-workflow-studio/local-executor';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { FolderGrantStore } from './folder-grants';
import { DesktopSpreadsheetExecutor } from './local-executor';

const DEVICE_ID = '10000000-0000-4000-8000-000000000821';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('DesktopSpreadsheetExecutor', () => {
  it('reads and writes only through a grant and suppresses the same input after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-desktop-executor-'));
    temporaryDirectories.push(directory);
    const sourcePath = join(directory, 'orders.csv');
    const outputPath = join(directory, 'combined.xlsx');
    await writeFile(
      sourcePath,
      'Order ID,Customer,Amount\nA-1,Acme,10\nA-1,Acme updated,20\nB-2,Beta,15\n',
      'utf8',
    );
    const grants = new FolderGrantStore(join(directory, '.agent', 'folder-grants.json'));
    const grant = await grants.authorize(directory, DEVICE_ID, {
      read: true,
      watch: true,
      write: true,
    });
    const ledgerPath = join(directory, '.agent', 'processing-ledger.json');
    const executor = new DesktopSpreadsheetExecutor(grants, new ProcessingLedger(ledgerPath));

    const input = await executor.read(DEVICE_ID, {
      folderAliasId: grant.folderAliasId,
      relativePath: 'orders.csv',
    });
    const transformed = executor.transform(input.sheets, {
      deduplicate: { keep: 'last', keys: ['Order ID'] },
    });
    expect(transformed.rows).toHaveLength(2);
    const sourceHash = await hashFile(sourcePath);
    const first = await executor.writeOnce(
      DEVICE_ID,
      'workflow-version-1',
      [input.source.fileHash],
      {
        folderAliasId: grant.folderAliasId,
        outputName: 'combined.xlsx',
      },
      [transformed],
    );
    expect(first).toMatchObject({
      duplicate: false,
      result: { processedRowCount: 2 },
    });
    expect(await hashFile(sourcePath)).toBe(sourceHash);
    expect(await hashFile(outputPath)).toBe(first.result?.fileHash);

    const restarted = new DesktopSpreadsheetExecutor(grants, new ProcessingLedger(ledgerPath));
    await expect(
      restarted.writeOnce(
        DEVICE_ID,
        'workflow-version-1',
        [input.source.fileHash],
        {
          folderAliasId: grant.folderAliasId,
          outputName: 'combined.xlsx',
        },
        [transformed],
      ),
    ).resolves.toEqual({ duplicate: true });
    await expect(
      restarted.read(DEVICE_ID, {
        folderAliasId: grant.folderAliasId,
        relativePath: '../orders.csv',
      }),
    ).rejects.toMatchObject({ code: 'FOLDER_TRAVERSAL_REJECTED' });
  });
});
