import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

if (process.platform !== 'darwin') {
  process.exit(0);
}

const releaseDirectory = join(import.meta.dirname, 'release');
const appBundles = readdirSync(releaseDirectory)
  .filter((entry) => entry.startsWith('mac'))
  .map((entry) => join(releaseDirectory, entry, 'AI Workflow Studio Agent.app'))
  .filter((appBundle) => {
    try {
      return statSync(appBundle).isDirectory();
    } catch {
      return false;
    }
  });

if (appBundles.length === 0) {
  throw new Error('No packaged macOS Agent app was found for local ad-hoc signing.');
}

for (const appBundle of appBundles) {
  const stagingDirectory = mkdtempSync(join(tmpdir(), 'aiws-agent-sign-'));
  const stagedAppBundle = join(stagingDirectory, 'AI Workflow Studio Agent.app');
  cpSync(appBundle, stagedAppBundle, {
    dereference: false,
    preserveTimestamps: true,
    recursive: true,
    verbatimSymlinks: true,
  });
  execFileSync('xattr', ['-cr', stagedAppBundle], { stdio: 'inherit' });
  execFileSync(
    'codesign',
    [
      '--force',
      '--deep',
      '--sign',
      '-',
      '--identifier',
      'com.aiworkflowstudio.agent',
      stagedAppBundle,
    ],
    { stdio: 'inherit' },
  );
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', stagedAppBundle], {
    stdio: 'inherit',
  });
  rmSync(appBundle, { recursive: true });
  renameSync(stagedAppBundle, appBundle);
  rmSync(stagingDirectory, { recursive: true });
}
