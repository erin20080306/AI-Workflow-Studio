import { createHash } from 'node:crypto';
import { createReadStream, existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const CHECKSUM_PATTERN = /^([a-f0-9]{64})[ ]{2}([^/\\]+)$/u;
const RELEASE_FILE_PATTERN =
  /\.(?:appx|appxupload|blockmap|dmg|exe|msi|msix|msixupload|pkg|tar\.gz|yml|yaml|zip)$/iu;
const BUILD_DIAGNOSTIC_FILES = new Set(['builder-debug.yml', 'builder-effective-config.yaml']);
const SENSITIVE_FILE_PATTERNS = [
  { name: 'environment file', pattern: /(?:^|[/\\])\.env(?:[./\\]|$)/iu },
  {
    name: 'private credential file',
    pattern: /\.(?:cer|crt|der|key|p12|pfx|pem)$/iu,
  },
];
const SENSITIVE_CONTENT_PATTERNS = [
  {
    name: 'private key material',
    pattern: /-----BEGIN (?:EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/u,
  },
  {
    name: 'GitHub credential',
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/u,
  },
  {
    name: 'Slack credential',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u,
  },
  {
    name: 'provider API credential',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/u,
  },
  {
    name: 'AWS access key',
    pattern: /\bAKIA[A-Z0-9]{16}\b/u,
  },
];

function readOption(argumentsList, name, required = true) {
  const index = argumentsList.indexOf(`--${name}`);
  const value = index === -1 ? undefined : argumentsList[index + 1];

  if (required && (value === undefined || value.startsWith('--') || value.trim() === '')) {
    throw new Error(`Missing required --${name} option.`);
  }

  return value;
}

function assertSafeFileName(fileName) {
  if (fileName !== path.basename(fileName) || fileName.includes('\0')) {
    throw new Error(`Unsafe artifact filename: ${fileName}`);
  }
}

async function sha256(filePath) {
  const digest = createHash('sha256');
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    digest.update(chunk);
  }

  return digest.digest('hex');
}

async function walkFiles(rootDirectory) {
  const files = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        const targetPath = await fs.realpath(fullPath);
        const targetRelativePath = path.relative(rootDirectory, targetPath);
        if (
          targetRelativePath === '..' ||
          targetRelativePath.startsWith(`..${path.sep}`) ||
          path.isAbsolute(targetRelativePath)
        ) {
          throw new Error(
            `Artifact symbolic link escapes its directory: ${path.relative(rootDirectory, fullPath)}`,
          );
        }
        continue;
      }

      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await visit(rootDirectory);
  return files.sort((left, right) => left.localeCompare(right));
}

async function releaseFiles(directory, excludedNames) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        RELEASE_FILE_PATTERN.test(entry.name) &&
        !BUILD_DIAGNOSTIC_FILES.has(entry.name) &&
        !excludedNames.has(entry.name),
    )
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export async function createManifest({
  architecture,
  checksumPath,
  directory,
  gitRef,
  gitSha,
  metadataPath,
  platform,
  signingStatus,
  version,
}) {
  const resolvedDirectory = path.resolve(directory);
  const resolvedChecksumPath = path.resolve(checksumPath);
  const resolvedMetadataPath = path.resolve(metadataPath);
  const excludedNames = new Set([
    path.basename(resolvedChecksumPath),
    path.basename(resolvedMetadataPath),
  ]);
  const files = await releaseFiles(resolvedDirectory, excludedNames);

  if (files.length === 0) {
    throw new Error(`No release artifacts found in ${resolvedDirectory}.`);
  }

  const versionMarker = `-${version}-`;
  if (!files.some((filePath) => path.basename(filePath).includes(versionMarker))) {
    throw new Error(`No release artifact filename contains the requested version ${version}.`);
  }

  const artifacts = [];
  for (const filePath of files) {
    const stats = await fs.stat(filePath);
    const fileName = path.basename(filePath);
    assertSafeFileName(fileName);
    artifacts.push({
      fileName,
      sha256: await sha256(filePath),
      sizeBytes: stats.size,
    });
  }

  const checksumText = `${artifacts
    .map((artifact) => `${artifact.sha256}  ${artifact.fileName}`)
    .join('\n')}\n`;
  const metadata = {
    schemaVersion: 1,
    release: {
      gitRef,
      gitSha,
      version,
    },
    target: {
      architecture,
      platform,
      signingStatus,
    },
    artifacts,
  };

  await fs.writeFile(resolvedChecksumPath, checksumText, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.writeFile(resolvedMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });

  return metadata;
}

export async function verifyChecksums({ checksumPath, directory }) {
  const resolvedDirectory = path.resolve(directory);
  const lines = (await fs.readFile(checksumPath, 'utf8'))
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error(`Checksum file is empty: ${checksumPath}`);
  }

  for (const line of lines) {
    const match = CHECKSUM_PATTERN.exec(line);
    if (match === null) {
      throw new Error(`Invalid checksum line: ${line}`);
    }

    const [, expectedDigest, fileName] = match;
    assertSafeFileName(fileName);
    const filePath = path.join(resolvedDirectory, fileName);

    if (!existsSync(filePath)) {
      throw new Error(`Missing artifact listed in checksums: ${fileName}`);
    }

    const actualDigest = await sha256(filePath);
    if (actualDigest !== expectedDigest) {
      throw new Error(`Checksum mismatch for ${fileName}.`);
    }
  }
}

export async function verifyChecksumTree(directory) {
  const files = await walkFiles(path.resolve(directory));
  const checksumFiles = files.filter((filePath) =>
    path.basename(filePath).startsWith('SHA256SUMS-'),
  );

  if (checksumFiles.length === 0) {
    throw new Error('No platform checksum files were found.');
  }

  for (const checksumPath of checksumFiles) {
    await verifyChecksums({
      checksumPath,
      directory: path.dirname(checksumPath),
    });
  }
}

async function scanContent(filePath, workspacePath) {
  const stream = createReadStream(filePath);
  let overlap = '';

  for await (const chunk of stream) {
    const current = overlap + chunk.toString('utf8');
    for (const rule of SENSITIVE_CONTENT_PATTERNS) {
      if (rule.pattern.test(current)) {
        return rule.name;
      }
    }

    if (workspacePath !== '' && current.includes(workspacePath)) {
      return 'local workspace path';
    }

    overlap = current.slice(-2048);
  }

  return undefined;
}

export async function scanArtifacts({ directory, workspacePath = process.cwd() }) {
  const resolvedDirectory = path.resolve(directory);
  const resolvedWorkspacePath = workspacePath === '' ? '' : path.resolve(workspacePath);
  const files = (await walkFiles(resolvedDirectory)).filter(
    (filePath) => !BUILD_DIAGNOSTIC_FILES.has(path.basename(filePath)),
  );
  const violations = [];

  for (const filePath of files) {
    const relativePath = path.relative(resolvedDirectory, filePath);
    const fileRule = SENSITIVE_FILE_PATTERNS.find((rule) => rule.pattern.test(relativePath));
    if (fileRule !== undefined) {
      violations.push(`${relativePath}: ${fileRule.name}`);
      continue;
    }

    const contentRule = await scanContent(filePath, resolvedWorkspacePath);
    if (contentRule !== undefined) {
      violations.push(`${relativePath}: ${contentRule}`);
    }
  }

  if (violations.length > 0) {
    throw new Error(`Sensitive material detected in release artifacts:\n${violations.join('\n')}`);
  }
}

export async function combineManifests({ checksumPath, directory, metadataPath }) {
  const resolvedDirectory = path.resolve(directory);
  const files = await walkFiles(resolvedDirectory);
  const manifestFiles = files.filter((filePath) =>
    /^release-metadata-(?:macos|windows)-/u.test(path.basename(filePath)),
  );

  if (manifestFiles.length === 0) {
    throw new Error('No platform release metadata files were found.');
  }

  const manifests = [];
  const artifacts = [];
  const names = new Set();
  let release;

  for (const manifestPath of manifestFiles) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (
      manifest.schemaVersion !== 1 ||
      !Array.isArray(manifest.artifacts) ||
      typeof manifest.release?.version !== 'string'
    ) {
      throw new Error(`Invalid platform release metadata: ${path.basename(manifestPath)}`);
    }

    if (release === undefined) {
      release = manifest.release;
    } else if (
      release.version !== manifest.release.version ||
      release.gitSha !== manifest.release.gitSha
    ) {
      throw new Error('Platform metadata describes different releases.');
    }

    for (const artifact of manifest.artifacts) {
      assertSafeFileName(artifact.fileName);
      if (names.has(artifact.fileName)) {
        throw new Error(`Duplicate release artifact: ${artifact.fileName}`);
      }
      names.add(artifact.fileName);
      artifacts.push(artifact);
    }

    manifests.push({
      fileName: path.basename(manifestPath),
      target: manifest.target,
    });
  }

  artifacts.sort((left, right) => left.fileName.localeCompare(right.fileName));
  manifests.sort((left, right) => left.fileName.localeCompare(right.fileName));

  await fs.writeFile(
    checksumPath,
    `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.fileName}`).join('\n')}\n`,
    'utf8',
  );
  await fs.writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        release,
        targets: manifests,
        artifacts,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function runCli() {
  const [command, ...argumentsList] = process.argv.slice(2);

  if (command === 'manifest') {
    const directory = readOption(argumentsList, 'directory');
    const platform = readOption(argumentsList, 'platform');
    const architecture = readOption(argumentsList, 'arch');
    await createManifest({
      architecture,
      checksumPath: readOption(argumentsList, 'checksums'),
      directory,
      gitRef: readOption(argumentsList, 'git-ref'),
      gitSha: readOption(argumentsList, 'git-sha'),
      metadataPath: readOption(argumentsList, 'metadata'),
      platform,
      signingStatus: readOption(argumentsList, 'signing-status'),
      version: readOption(argumentsList, 'version'),
    });
    return;
  }

  if (command === 'verify-tree') {
    await verifyChecksumTree(readOption(argumentsList, 'directory'));
    return;
  }

  if (command === 'scan') {
    await scanArtifacts({
      directory: readOption(argumentsList, 'directory'),
      workspacePath: readOption(argumentsList, 'workspace', false) ?? process.cwd(),
    });
    return;
  }

  if (command === 'combine') {
    await combineManifests({
      checksumPath: readOption(argumentsList, 'checksums'),
      directory: readOption(argumentsList, 'directory'),
      metadataPath: readOption(argumentsList, 'metadata'),
    });
    return;
  }

  throw new Error('Usage: release-artifacts.mjs <manifest|verify-tree|scan|combine> [options]');
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
