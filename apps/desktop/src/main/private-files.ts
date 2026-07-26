import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_PRIVATE_FILE_BYTES = 1_000_000;

export async function readPrivateFile(path: string): Promise<string | undefined> {
  try {
    const content = await readFile(path);
    if (content.byteLength > MAX_PRIVATE_FILE_BYTES) {
      throw new Error('Private settings file is too large.');
    }
    return content.toString('utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function writePrivateFile(path: string, content: string): Promise<void> {
  if (Buffer.byteLength(content, 'utf8') > MAX_PRIVATE_FILE_BYTES) {
    throw new Error('Private settings file is too large.');
  }
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function removePrivateFile(path: string): Promise<void> {
  await rm(path, { force: true });
}
