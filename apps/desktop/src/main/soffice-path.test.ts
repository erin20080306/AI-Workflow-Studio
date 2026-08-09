import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveSofficePath } from './soffice-path';

const RES = '/app/Contents/Resources';

function existsOnly(present: readonly string[]): (candidate: string) => boolean {
  const set = new Set(present);
  return (candidate) => set.has(candidate);
}

describe('resolveSofficePath', () => {
  it('prefers the bundled LibreOffice inside a packaged macOS app', () => {
    const bundled = join(RES, 'libreoffice', 'LibreOffice.app', 'Contents', 'MacOS', 'soffice');
    const resolved = resolveSofficePath({
      env: {},
      fileExists: existsOnly([bundled, '/Applications/LibreOffice.app/Contents/MacOS/soffice']),
      isPackaged: true,
      platform: 'darwin',
      resourcesPath: RES,
    });
    expect(resolved).toBe(bundled);
  });

  it('does not fall back to a system install when packaged', () => {
    const resolved = resolveSofficePath({
      env: {},
      fileExists: existsOnly(['/Applications/LibreOffice.app/Contents/MacOS/soffice']),
      isPackaged: true,
      platform: 'darwin',
      resourcesPath: RES,
    });
    expect(resolved).toBeUndefined();
  });

  it('uses the system LibreOffice in development when nothing is bundled', () => {
    const system = '/Applications/LibreOffice.app/Contents/MacOS/soffice';
    const resolved = resolveSofficePath({
      env: {},
      fileExists: existsOnly([system]),
      isPackaged: false,
      platform: 'darwin',
      resourcesPath: RES,
    });
    expect(resolved).toBe(system);
  });

  it('honors the AIWS_SOFFICE_PATH override first', () => {
    const override = '/custom/soffice';
    const resolved = resolveSofficePath({
      env: { AIWS_SOFFICE_PATH: override },
      fileExists: existsOnly([override, '/usr/bin/soffice']),
      isPackaged: false,
      platform: 'linux',
      resourcesPath: RES,
    });
    expect(resolved).toBe(override);
  });

  it('resolves the bundled Windows binary path', () => {
    const bundled = join(RES, 'libreoffice', 'program', 'soffice.exe');
    const resolved = resolveSofficePath({
      env: {},
      fileExists: existsOnly([bundled]),
      isPackaged: true,
      platform: 'win32',
      resourcesPath: RES,
    });
    expect(resolved).toBe(bundled);
  });

  it('returns undefined when no LibreOffice is available', () => {
    const resolved = resolveSofficePath({
      env: {},
      fileExists: existsOnly([]),
      isPackaged: false,
      platform: 'linux',
      resourcesPath: RES,
    });
    expect(resolved).toBeUndefined();
  });
});
