import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scanClientBundle } from './scan-client-bundle.mjs';

const temporaryDirectories: string[] = [];

async function bundleDirectory() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-workflow-client-bundle-'));
  const directory = path.join(root, 'static');
  await mkdir(directory);
  temporaryDirectories.push(root);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('client bundle scanner', () => {
  it('accepts normal browser assets', async () => {
    const directory = await bundleDirectory();
    await writeFile(path.join(directory, 'app.js'), 'console.log("safe public asset")');

    await expect(
      scanClientBundle({ directory, secretValues: {}, workspacePath: '' }),
    ).resolves.toEqual({ filesScanned: 1 });
  });

  it('rejects configured server secret values', async () => {
    const directory = await bundleDirectory();
    const secret = 'synthetic-server-secret-never-ship';
    await writeFile(path.join(directory, 'app.js'), `window.value="${secret}"`);

    await expect(
      scanClientBundle({
        directory,
        secretValues: { SUPABASE_SERVICE_ROLE_KEY: secret },
        workspacePath: '',
      }),
    ).rejects.toThrow('configured SUPABASE_SERVICE_ROLE_KEY value');
  });

  it('rejects server-only variable names and local workspace paths', async () => {
    const directory = await bundleDirectory();
    await writeFile(
      path.join(directory, 'app.js'),
      `const key="OPENAI_API_KEY"; const path="${directory}";`,
    );

    await expect(
      scanClientBundle({ directory, secretValues: {}, workspacePath: directory }),
    ).rejects.toThrow('server-only environment variable name');
  });
});
