import { generateKeyPairSync } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  exchangeGithubOauthCode,
  getGithubAppConfiguration,
  githubAppInstallationUrl,
  validateGithubInstallationForUser,
} from './github-app-client';

function stubGithubConfiguration(): void {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const encodedPrivateKey = Buffer.from(
    privateKey.export({ format: 'pem', type: 'pkcs8' }),
  ).toString('base64');
  vi.stubEnv('GITHUB_APP_CLIENT_ID', 'Iv1.example-client');
  vi.stubEnv('GITHUB_APP_CLIENT_SECRET', 'github-client-secret-long-enough');
  vi.stubEnv('GITHUB_APP_ID', '123456');
  vi.stubEnv('GITHUB_APP_PRIVATE_KEY_BASE64', encodedPrivateKey);
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

  it('validates the selected installation through the authorized installation list', async () => {
    stubGithubConfiguration();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        installations: [
          {
            account: { login: 'workflow-owner', type: 'User' },
            id: 987_654,
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      validateGithubInstallationForUser('github-user-token-long-enough', '987654'),
    ).resolves.toEqual({
      login: 'workflow-owner',
      type: 'User',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user/installations?per_page=100&page=1',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer github-user-token-long-enough',
        }),
        method: 'GET',
      }),
    );
  });

  it('confirms a newly installed personal account with the App identity fallback', async () => {
    stubGithubConfiguration();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ installations: [] }))
      .mockResolvedValueOnce(Response.json({ login: 'workflow-owner', type: 'User' }))
      .mockResolvedValueOnce(
        Response.json({
          account: { login: 'workflow-owner', type: 'User' },
          id: 987_654,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      validateGithubInstallationForUser('github-user-token-long-enough', '987654'),
    ).resolves.toEqual({
      login: 'workflow-owner',
      type: 'User',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.github.com/app/installations/987654',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: expect.stringMatching(/^Bearer [^.]+\.[^.]+\.[^.]+$/),
        }),
        method: 'GET',
      }),
    );
  });
});
