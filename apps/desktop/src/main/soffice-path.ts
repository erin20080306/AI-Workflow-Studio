import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface SofficePathDeps {
  readonly isPackaged: boolean;
  readonly platform: NodeJS.Platform;
  readonly resourcesPath: string;
  readonly env: NodeJS.ProcessEnv;
  readonly fileExists: (candidate: string) => boolean;
}

/**
 * The LibreOffice binary is bundled under `extraResources/libreoffice` so a
 * packaged Agent needs no separate customer install. Development and CI fall
 * back to `AIWS_SOFFICE_PATH` and then the platform's standard install path.
 *
 * Returns `undefined` when no LibreOffice binary is available; callers must
 * fail closed rather than guess.
 */
export function resolveSofficePath(deps: SofficePathDeps): string | undefined {
  const candidates: string[] = [];

  const override = deps.env.AIWS_SOFFICE_PATH;
  if (override !== undefined && override.length > 0) candidates.push(override);

  const bundledRoot = join(deps.resourcesPath, 'libreoffice');
  if (deps.platform === 'darwin') {
    candidates.push(join(bundledRoot, 'LibreOffice.app', 'Contents', 'MacOS', 'soffice'));
  } else if (deps.platform === 'win32') {
    candidates.push(join(bundledRoot, 'program', 'soffice.exe'));
  } else {
    candidates.push(join(bundledRoot, 'program', 'soffice'));
  }

  // System fallbacks are only consulted outside a packaged app so that a
  // shipped Agent always uses its own vetted, bundled LibreOffice.
  if (!deps.isPackaged) {
    if (deps.platform === 'darwin') {
      candidates.push('/Applications/LibreOffice.app/Contents/MacOS/soffice');
    } else if (deps.platform === 'win32') {
      candidates.push('C:\\Program Files\\LibreOffice\\program\\soffice.exe');
      candidates.push('C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe');
    } else {
      candidates.push(
        '/usr/bin/soffice',
        '/usr/bin/libreoffice',
        '/opt/libreoffice/program/soffice',
      );
    }
  }

  return candidates.find((candidate) => deps.fileExists(candidate));
}

export function resolveInstalledSofficePath(
  isPackaged: boolean,
  resourcesPath: string,
): string | undefined {
  return resolveSofficePath({
    env: process.env,
    fileExists: existsSync,
    isPackaged,
    platform: process.platform,
    resourcesPath,
  });
}
