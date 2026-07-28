import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getGithubAppConfiguration } from './github-app-client';

describe('getGithubAppConfiguration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts the GitHub credentials inside a normal server environment', () => {
    const privateKey = Buffer.from(
      '-----BEGIN PRIVATE KEY-----\n' + 'A'.repeat(300) + '\n-----END PRIVATE KEY-----',
    ).toString('base64');
    vi.stubEnv('GITHUB_APP_CLIENT_ID', 'Iv1.example-client');
    vi.stubEnv('GITHUB_APP_CLIENT_SECRET', 'github-client-secret-long-enough');
    vi.stubEnv('GITHUB_APP_ID', '123456');
    vi.stubEnv('GITHUB_APP_PRIVATE_KEY_BASE64', privateKey);
    vi.stubEnv('GITHUB_APP_SLUG', 'ai-workflow-studio-publisher');
    vi.stubEnv('VERCEL_ENV', 'production');

    expect(getGithubAppConfiguration()).toMatchObject({
      appId: '123456',
      appSlug: 'ai-workflow-studio-publisher',
      clientId: 'Iv1.example-client',
      clientSecret: 'github-client-secret-long-enough',
    });
  });
});
