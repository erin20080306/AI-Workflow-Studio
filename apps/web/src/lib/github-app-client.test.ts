import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  exchangeGithubOauthCode,
  getGithubAppConfiguration,
  githubAppInstallationUrl,
} from './github-app-client';

function stubGithubConfiguration(): void {
  const privateKey = Buffer.from(
    '-----BEGIN PRIVATE KEY-----\n' + 'A'.repeat(300) + '\n-----END PRIVATE KEY-----',
  ).toString('base64');
  vi.stubEnv('GITHUB_APP_CLIENT_ID', 'Iv1.example-client');
  vi.stubEnv('GITHUB_APP_CLIENT_SECRET', 'github-client-secret-long-enough');
  vi.stubEnv('GITHUB_APP_ID', '123456');
  vi.stubEnv('GITHUB_APP_PRIVATE_KEY_BASE64', privateKey);
  vi.stubEnv('GITHUB_APP_SLUG', 'ai-workflow-studio-publisher');
}

describe('getGithubAppConfiguration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('accepts the GitHub credentials inside a normal server environment', () => {
    stubGithubConfiguration();
    vi.stubEnv('VERCEL_ENV', 'production');

    expect(getGithubAppConfiguration()).toMatchObject({
      appId: '123456',
      appSlug: 'ai-workflow-studio-publisher',
      clientId: 'Iv1.example-client',
      clientSecret: 'github-client-secret-long-enough',
    });
  });

  it('binds the installation redirect to the generated OAuth state', () => {
    expect(
      githubAppInstallationUrl('ai-workflow-studio-publisher', 'state-with-random-entropy'),
    ).toBe(
      'https://github.com/apps/ai-workflow-studio-publisher/installations/new?state=state-with-random-entropy',
    );
  });

  it('requests a JSON OAuth response before parsing the user token', async () => {
    stubGithubConfiguration();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        access_token: 'github-user-token-long-enough',
        token_type: 'bearer',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeGithubOauthCode('temporary-oauth-code', 'pkce-verifier')).resolves.toBe(
      'github-user-token-long-enough',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: 'application/json',
          'content-type': 'application/json',
        }),
        method: 'POST',
      }),
    );
  });
});
