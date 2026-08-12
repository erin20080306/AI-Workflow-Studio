import { describe, expect, it } from 'vitest';

import {
  assertWebsiteGithubSourceSafe,
  assertWebsiteNextSourceSafe,
} from './website-github-source-safety';

function source(path: string, content: string) {
  const bytes = new TextEncoder().encode(content);
  return {
    fileCount: 1,
    files: [{ bytes, path, sha256: '0'.repeat(64) }],
    sourceSha256: '1'.repeat(64),
    uncompressedBytes: bytes.byteLength,
  };
}

function bytesSource(path: string, bytes: Uint8Array) {
  return {
    fileCount: 1,
    files: [{ bytes, path, sha256: '0'.repeat(64) }],
    sourceSha256: '1'.repeat(64),
    uncompressedBytes: bytes.byteLength,
  };
}

describe('GitHub website source safety', () => {
  it('accepts bounded static content', () => {
    expect(() =>
      assertWebsiteGithubSourceSafe(source('index.html', '<h1>Virtual operations demo</h1>')),
    ).not.toThrow();
  });

  it('rejects traversal, credentials, and local absolute paths', () => {
    expect(() => assertWebsiteGithubSourceSafe(source('../secret.txt', 'safe'))).toThrow(
      'unsafe path',
    );
    expect(() =>
      assertWebsiteGithubSourceSafe(source('README.txt', 'SUPABASE_SERVICE_ROLE_KEY=secret')),
    ).toThrow('sensitive content');
    expect(() =>
      assertWebsiteGithubSourceSafe(source('README.txt', '/Users/private-user/Desktop/data.csv')),
    ).toThrow('sensitive content');
  });
});

describe('self-hosted Next.js store source safety', () => {
  it('allows the SUPABASE_SERVICE_ROLE_KEY env-var name in code, README, and env template', () => {
    expect(() =>
      assertWebsiteNextSourceSafe(
        source('app/api/checkout/route.ts', 'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;'),
      ),
    ).not.toThrow();
    expect(() =>
      assertWebsiteNextSourceSafe(source('README.md', 'Set SUPABASE_SERVICE_ROLE_KEY in Vercel.')),
    ).not.toThrow();
    expect(() =>
      assertWebsiteNextSourceSafe(source('.env.example', 'SUPABASE_SERVICE_ROLE_KEY=')),
    ).not.toThrow();
  });

  it('still blocks real secret values, private keys, and traversal — scanning code files too', () => {
    expect(() =>
      assertWebsiteNextSourceSafe(
        source('lib/products.ts', 'const t = "ghp_' + 'a'.repeat(30) + '";'),
      ),
    ).toThrow('sensitive content');
    expect(() =>
      assertWebsiteNextSourceSafe(
        source('app/api/checkout/route.ts', '-----BEGIN PRIVATE KEY-----'),
      ),
    ).toThrow('sensitive content');
    expect(() => assertWebsiteNextSourceSafe(source('../evil.ts', 'x'))).toThrow('unsafe path');
  });

  it('allows PNG assets but fails closed on unexpected binaries', () => {
    const png = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3);
    expect(() =>
      assertWebsiteNextSourceSafe(bytesSource('public/assets/a.png', png)),
    ).not.toThrow();
    // Invalid UTF-8 in a non-image path fails closed.
    expect(() =>
      assertWebsiteNextSourceSafe(bytesSource('lib/x.ts', Uint8Array.of(0xff, 0xfe))),
    ).toThrow('unexpected binary');
  });
});
