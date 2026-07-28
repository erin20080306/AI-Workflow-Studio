import { describe, expect, it } from 'vitest';

import { assertWebsiteGithubSourceSafe } from './website-github-source-safety';

function source(path: string, content: string) {
  const bytes = new TextEncoder().encode(content);
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
