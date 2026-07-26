import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { FolderGrantStore } from './folder-grants';

const DEVICE_ID = '10000000-0000-4000-8000-000000000811';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'aiws-folders-'));
  temporaryDirectories.push(directory);
  const authorized = join(directory, 'authorized');
  const outside = join(directory, 'outside');
  await mkdir(join(authorized, 'nested'), { recursive: true });
  await mkdir(outside);
  await writeFile(join(authorized, 'nested', 'orders.csv'), 'id,total\n1,10\n');
  await writeFile(join(outside, 'private.csv'), 'secret\n');
  await symlink(outside, join(authorized, 'escape'));
  const store = new FolderGrantStore(join(directory, 'grants.json'));
  const grant = await store.authorize(authorized, DEVICE_ID, {
    read: true,
    watch: true,
    write: false,
  });
  return { authorized, directory, grant, outside, store };
}

describe('FolderGrantStore', () => {
  it('resolves an existing file contained by an authorized canonical root', async () => {
    const { authorized, grant, store } = await fixture();
    const expected = await realpath(join(authorized, 'nested', 'orders.csv'));

    await expect(
      store.resolveAuthorizedPath(grant.folderAliasId, DEVICE_ID, 'nested/orders.csv', 'read'),
    ).resolves.toBe(expected);
  });

  it('rejects traversal, symlink escape, the wrong device, and missing write permission', async () => {
    const { grant, store } = await fixture();

    await expect(
      store.resolveAuthorizedPath(grant.folderAliasId, DEVICE_ID, '../outside/private.csv', 'read'),
    ).rejects.toMatchObject({ code: 'FOLDER_TRAVERSAL_REJECTED' });
    await expect(
      store.resolveAuthorizedPath(grant.folderAliasId, DEVICE_ID, 'escape/private.csv', 'read'),
    ).rejects.toMatchObject({ code: 'FOLDER_TRAVERSAL_REJECTED' });
    await expect(
      store.resolveAuthorizedPath(
        grant.folderAliasId,
        '10000000-0000-4000-8000-000000000812',
        'nested/orders.csv',
        'read',
      ),
    ).rejects.toMatchObject({ code: 'FOLDER_ALIAS_NOT_FOUND' });
    await expect(
      store.resolveAuthorizedPath(grant.folderAliasId, DEVICE_ID, 'nested/orders.csv', 'write'),
    ).rejects.toMatchObject({ code: 'FOLDER_PERMISSION_DENIED' });
  });

  it('never exposes canonical paths through folder views', async () => {
    const { authorized, grant, store } = await fixture();
    const serialized = JSON.stringify(await store.list(DEVICE_ID));

    expect(serialized).not.toContain(authorized);
    expect(serialized).toContain(grant.folderAliasId);
  });
});
