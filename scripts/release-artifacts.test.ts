import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  combineManifests,
  createManifest,
  scanArtifacts,
  verifyChecksums,
} from './release-artifacts.mjs';

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ai-workflow-release-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('release artifact controls', () => {
  it('creates deterministic checksums and rejects tampering', async () => {
    const directory = await temporaryDirectory();
    const artifactPath = path.join(directory, 'AI-Workflow-Studio-Agent-0.1.0-mac-universal.zip');
    const checksumPath = path.join(directory, 'SHA256SUMS-macos-universal');
    const metadataPath = path.join(directory, 'release-metadata-macos-universal.json');
    await writeFile(artifactPath, 'signed release bytes');

    const manifest = await createManifest({
      architecture: 'universal',
      checksumPath,
      directory,
      gitRef: 'v0.1.0',
      gitSha: 'a'.repeat(40),
      metadataPath,
      platform: 'macos',
      signingStatus: 'signed-notarized',
      version: '0.1.0',
    });

    expect(manifest.artifacts).toHaveLength(1);
    await expect(verifyChecksums({ checksumPath, directory })).resolves.toBeUndefined();

    await writeFile(artifactPath, 'tampered bytes');
    await expect(verifyChecksums({ checksumPath, directory })).rejects.toThrow('Checksum mismatch');
  });

  it('rejects a release tag that does not match the packaged version', async () => {
    const directory = await temporaryDirectory();
    await writeFile(
      path.join(directory, 'AI-Workflow-Studio-Agent-0.1.0-windows-x64.exe'),
      'installer bytes',
    );

    await expect(
      createManifest({
        architecture: 'x64',
        checksumPath: path.join(directory, 'SHA256SUMS-windows-x64'),
        directory,
        gitRef: 'v0.2.0',
        gitSha: 'a'.repeat(40),
        metadataPath: path.join(directory, 'release-metadata-windows-x64.json'),
        platform: 'windows',
        signingStatus: 'signed',
        version: '0.2.0',
      }),
    ).rejects.toThrow('requested version 0.2.0');
  });

  it('combines matching platform metadata without path disclosure', async () => {
    const directory = await temporaryDirectory();
    const macDirectory = path.join(directory, 'macos');
    const windowsDirectory = path.join(directory, 'windows');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(macDirectory);
    await mkdir(windowsDirectory);

    for (const target of [
      {
        architecture: 'universal',
        directory: macDirectory,
        extension: 'zip',
        platform: 'macos',
        signingStatus: 'signed-notarized',
      },
      {
        architecture: 'x64',
        directory: windowsDirectory,
        extension: 'exe',
        platform: 'windows',
        signingStatus: 'signed',
      },
    ]) {
      await writeFile(
        path.join(
          target.directory,
          `AI-Workflow-Studio-Agent-0.1.0-${target.platform}-${target.architecture}.${target.extension}`,
        ),
        target.platform,
      );
      await createManifest({
        architecture: target.architecture,
        checksumPath: path.join(
          target.directory,
          `SHA256SUMS-${target.platform}-${target.architecture}`,
        ),
        directory: target.directory,
        gitRef: 'v0.1.0',
        gitSha: 'b'.repeat(40),
        metadataPath: path.join(
          target.directory,
          `release-metadata-${target.platform}-${target.architecture}.json`,
        ),
        platform: target.platform,
        signingStatus: target.signingStatus,
        version: '0.1.0',
      });
    }

    const combinedMetadata = path.join(directory, 'release-metadata.json');
    await combineManifests({
      checksumPath: path.join(directory, 'SHA256SUMS.txt'),
      directory,
      metadataPath: combinedMetadata,
    });

    const result = await readFile(combinedMetadata, 'utf8');
    expect(result).toContain('"version": "0.1.0"');
    expect(result).not.toContain(directory);
  });

  it('rejects credential files and private key content', async () => {
    const directory = await temporaryDirectory();
    await writeFile(path.join(directory, 'certificate.pem'), '-----BEGIN PRIVATE KEY-----');

    await expect(scanArtifacts({ directory, workspacePath: '' })).rejects.toThrow(
      'Sensitive material detected',
    );
  });
});
