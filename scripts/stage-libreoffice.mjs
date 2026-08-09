#!/usr/bin/env node
// Stage a headless LibreOffice into apps/desktop/build/libreoffice/ so the
// packaged desktop Agent bundles it and needs no separate customer install.
// electron-builder.yml copies that directory to Resources/libreoffice/, where
// apps/desktop/src/main/soffice-path.ts resolves the binary.
//
// Usage:
//   node scripts/stage-libreoffice.mjs [--mac-arch=aarch64|x86_64] [--force]
//                                      [--keep-download] [--dry-run]
//
// The platform is taken from the host (darwin/win32). macOS defaults to the
// aarch64 build; pass --mac-arch=x86_64 to stage the Intel build instead.

import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const manifestPath = path.join(scriptDir, 'libreoffice-manifest.json');
const stageRoot = path.join(repoRoot, 'apps', 'desktop', 'build', 'libreoffice');

function parseArgs(argv) {
  const options = {
    force: false,
    keepDownload: false,
    dryRun: false,
    printHash: false,
    macArch: 'aarch64',
  };
  for (const arg of argv) {
    if (arg === '--force') options.force = true;
    else if (arg === '--keep-download') options.keepDownload = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--print-hash') options.printHash = true;
    else if (arg.startsWith('--mac-arch=')) options.macArch = arg.slice('--mac-arch='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['aarch64', 'x86_64'].includes(options.macArch)) {
    throw new Error(`--mac-arch must be aarch64 or x86_64, got: ${options.macArch}`);
  }
  return options;
}

function platformKey(macArch) {
  if (process.platform === 'darwin') return `darwin-${macArch}`;
  if (process.platform === 'win32') return 'win32-x64';
  throw new Error(
    `Unsupported host platform for staging: ${process.platform}. Run on macOS or Windows.`,
  );
}

function run(command, args, extra = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...extra });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 'signal'}): ${command} ${args.join(' ')}`);
  }
  return result;
}

async function sha256File(file) {
  return await new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

async function download(url, destination) {
  process.stdout.write(`Downloading ${url}\n`);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await globalThis.fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(destination, buffer);
      return;
    } catch (error) {
      lastError = error;
      process.stdout.write(`  attempt ${attempt} failed: ${String(error)}\n`);
    }
  }
  throw new Error(`Failed to download ${url} after 3 attempts: ${String(lastError)}`);
}

function requirePinnedHash(pinned, key) {
  // The Document Foundation ships no .sha256 sidecar (only GPG .asc), so the
  // manifest must carry a committed pin. Fail closed rather than stage an
  // unverified bundle. Use --print-hash to compute the value to pin.
  if (typeof pinned === 'string' && /^[a-f0-9]{64}$/u.test(pinned)) return pinned.toLowerCase();
  throw new Error(
    `No sha256 pin for ${key} in scripts/libreoffice-manifest.json. ` +
      `Run "pnpm stage:libreoffice -- --print-hash" (with --mac-arch as needed) and paste the value.`,
  );
}

async function stageMacos(dmgPath) {
  // Attach the read-only image and read the mount point from the plist so the
  // image's CRC verification output can't be mistaken for the device table.
  const attach = spawnSync(
    'hdiutil',
    ['attach', dmgPath, '-nobrowse', '-readonly', '-mountrandom', os.tmpdir(), '-plist'],
    { encoding: 'utf8' },
  );
  if (attach.status !== 0) {
    throw new Error(`hdiutil attach failed: ${attach.stderr || attach.stdout}`);
  }
  const mountPoint = /<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/u
    .exec(attach.stdout)?.[1]
    .trim();
  if (!mountPoint || !existsSync(mountPoint)) {
    throw new Error(`Could not determine the DMG mount point from:\n${attach.stdout}`);
  }
  try {
    const source = path.join(mountPoint, 'LibreOffice.app');
    if (!existsSync(source)) throw new Error(`LibreOffice.app not found in the image at ${source}`);
    run('ditto', [source, path.join(stageRoot, 'LibreOffice.app')]);
  } finally {
    spawnSync('hdiutil', ['detach', mountPoint, '-quiet'], { stdio: 'ignore' });
  }
  // Clear the download quarantine so the bundled binary launches without prompts.
  run('xattr', ['-dr', 'com.apple.quarantine', path.join(stageRoot, 'LibreOffice.app')]);
}

async function stageWindows(msiPath) {
  // An administrative install lays out the full program tree without touching
  // the machine. It expands into a versioned "LibreOffice" folder we flatten
  // into build/libreoffice/ so program/soffice.exe sits at the expected path.
  const adminDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-admin-'));
  run('msiexec', ['/a', msiPath, '/qn', `TARGETDIR=${adminDir}`]);
  const installedRoot = await findProgramRoot(adminDir);
  await fs.cp(installedRoot, stageRoot, { recursive: true });
  await fs.rm(adminDir, { recursive: true, force: true });
}

async function findProgramRoot(root) {
  // The admin install nests the tree under an installer-named folder; locate
  // the directory that directly contains program/soffice.exe.
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (existsSync(path.join(current, 'program', 'soffice.exe'))) return current;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(path.join(current, entry.name));
    }
  }
  throw new Error(`Could not find program/soffice.exe under the administrative install at ${root}`);
}

function stagedBinary() {
  if (process.platform === 'darwin') {
    return path.join(stageRoot, 'LibreOffice.app', 'Contents', 'MacOS', 'soffice');
  }
  return path.join(stageRoot, 'program', 'soffice.exe');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const key = platformKey(options.macArch);
  const platform = manifest.platforms[key];
  if (!platform) throw new Error(`Manifest has no entry for platform ${key}`);

  const file = platform.file.replaceAll('{version}', manifest.version);
  const url = `${manifest.baseUrl}/${manifest.version}/${platform.path}/${file}`;

  if (options.dryRun) {
    process.stdout.write(
      `[dry-run] ${key} LibreOffice ${manifest.version}\n` +
        `[dry-run] would download ${url}\n[dry-run] would stage to ${stageRoot}\n`,
    );
    return;
  }

  // --print-hash downloads the artifact and prints its sha256 so a maintainer
  // can pin it in the manifest; it never stages.
  if (options.printHash) {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-hash-'));
    const artifactPath = path.join(workDir, file);
    try {
      await download(url, artifactPath);
      const actual = await sha256File(artifactPath);
      process.stdout.write(`${key} sha256: ${actual}\n`);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
    return;
  }

  const expected = requirePinnedHash(platform.sha256, key);

  const target = stagedBinary();
  if (existsSync(target) && !options.force) {
    process.stdout.write(`Already staged (${target}); pass --force to restage.\n`);
    return;
  }

  process.stdout.write(`Staging LibreOffice ${manifest.version} for ${key}\n`);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-stage-'));
  const artifactPath = path.join(workDir, file);
  try {
    await download(url, artifactPath);

    const actual = await sha256File(artifactPath);
    process.stdout.write(`sha256 (manifest pin): ${expected}\n`);
    process.stdout.write(`sha256 (downloaded):   ${actual}\n`);
    if (actual !== expected) {
      throw new Error('Checksum mismatch — refusing to stage a corrupt or tampered artifact.');
    }

    // Clear any previous payload so a restage cannot leave stale files behind,
    // but keep the tracked README.md that documents this directory.
    await fs.mkdir(stageRoot, { recursive: true });
    for (const entry of await fs.readdir(stageRoot)) {
      if (entry === 'README.md') continue;
      await fs.rm(path.join(stageRoot, entry), { recursive: true, force: true });
    }

    if (process.platform === 'darwin') await stageMacos(artifactPath);
    else await stageWindows(artifactPath);

    if (!existsSync(target)) {
      throw new Error(`Staging finished but ${target} is missing.`);
    }
    process.stdout.write(`Staged LibreOffice binary at ${target}\n`);
  } finally {
    if (options.keepDownload) {
      process.stdout.write(`Kept download at ${artifactPath}\n`);
    } else {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  process.stderr.write(
    `stage-libreoffice failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
