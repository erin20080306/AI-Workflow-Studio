import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const PNG_SIGNATURE = '89504e470d0a1a0a';

async function pngSize(
  relativePath: string,
): Promise<{ readonly height: number; readonly width: number }> {
  const content = await readFile(path.join(process.cwd(), relativePath));
  expect(content.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  expect(content.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return {
    height: content.readUInt32BE(20),
    width: content.readUInt32BE(16),
  };
}

describe('brand release assets', () => {
  it.each([
    ['apps/desktop/build/icon.png', 1024, 1024],
    ['apps/desktop/build/appx/StoreLogo.png', 50, 50],
    ['apps/desktop/build/appx/Square44x44Logo.png', 44, 44],
    ['apps/desktop/build/appx/Square150x150Logo.png', 150, 150],
    ['apps/desktop/build/appx/Square310x310Logo.png', 310, 310],
    ['apps/desktop/build/appx/Wide310x150Logo.png', 310, 150],
    ['apps/desktop/build/appx/SplashScreen.png', 620, 300],
  ])('%s has the required release dimensions', async (file, width, height) => {
    await expect(pngSize(file)).resolves.toEqual({ height, width });
  });
});
