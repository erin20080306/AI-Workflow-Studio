import 'server-only';

import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { z } from 'zod';

import type { WebsiteStaticSource } from './website-static-export';
import {
  WebsiteGithubAccountSchema,
  WebsiteGithubRepositorySchema,
  type WebsiteGithubAccount,
  type WebsiteGithubRepository,
} from './website-github-schema';

const GithubConfigurationSchema = z.object({
  GITHUB_APP_CLIENT_ID: z.string().min(10).max(160),
  GITHUB_APP_CLIENT_SECRET: z.string().min(24).max(500),
  GITHUB_APP_ID: z.string().regex(/^[1-9][0-9]{0,19}$/),
  GITHUB_APP_PRIVATE_KEY_BASE64: z.string().min(256).max(16_000),
  GITHUB_APP_SLUG: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

const InstallationSchema = z
  .object({
    account: z
      .object({
        login: z.string().min(1).max(100),
        type: z.enum(['Organization', 'User']),
      })
      .passthrough(),
    id: z.number().int().positive(),
  })
  .passthrough();

const UserInstallationsSchema = z
  .object({
    installations: z.array(InstallationSchema),
  })
  .passthrough();

const InstallationTokenSchema = z
  .object({
    token: z.string().min(20),
  })
  .passthrough();

const RepositoryResponseSchema = z
  .object({
    default_branch: z.string().min(1).max(255),
    full_name: z.string().min(3).max(220),
    id: z.number().int().positive(),
    private: z.boolean(),
  })
  .passthrough();

const RepositoryListSchema = z
  .object({
    repositories: z.array(RepositoryResponseSchema),
  })
  .passthrough();

const OAuthTokenSchema = z
  .object({
    access_token: z.string().min(20),
    token_type: z.string().min(1),
  })
  .passthrough();

const GitObjectSchema = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }).passthrough();
const GitCommitSchema = z
  .object({
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    tree: GitObjectSchema,
  })
  .passthrough();
const GitReferenceSchema = z.object({ object: GitObjectSchema }).passthrough();
const ContentSchema = z
  .object({
    content: z.string(),
    encoding: z.literal('base64'),
  })
  .passthrough();

export interface GithubAppConfiguration {
  readonly appId: string;
  readonly appSlug: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly privateKey: string;
}

export class GithubAppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 502, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'GithubAppError';
    this.status = status;
  }
}

function base64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function decodePrivateKey(value: string): string {
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  if (!decoded.includes('-----BEGIN') || !decoded.includes('PRIVATE KEY-----')) {
    throw new GithubAppError(
      'GITHUB_APP_CONFIGURATION_INVALID',
      'The GitHub App private key is invalid.',
      503,
    );
  }
  return decoded;
}

export function getGithubAppConfiguration(): GithubAppConfiguration {
  const parsed = GithubConfigurationSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new GithubAppError(
      'GITHUB_APP_NOT_CONFIGURED',
      'GitHub publishing is not configured.',
      503,
    );
  }
  return {
    appId: parsed.data.GITHUB_APP_ID,
    appSlug: parsed.data.GITHUB_APP_SLUG,
    clientId: parsed.data.GITHUB_APP_CLIENT_ID,
    clientSecret: parsed.data.GITHUB_APP_CLIENT_SECRET,
    privateKey: decodePrivateKey(parsed.data.GITHUB_APP_PRIVATE_KEY_BASE64),
  };
}

function appJwt(configuration: GithubAppConfiguration): string {
  const now = Math.floor(Date.now() / 1_000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      exp: now + 540,
      iat: now - 60,
      iss: configuration.appId,
    }),
  );
  const input = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(input), {
    key: createPrivateKey(configuration.privateKey),
  });
  return `${input}.${base64Url(signature)}`;
}

async function githubRequest(
  url: string,
  init: RequestInit,
  accepted: readonly number[] = [200],
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
  if (!accepted.includes(response.status)) {
    throw new GithubAppError(
      `GITHUB_HTTP_${response.status}`,
      'GitHub could not complete the requested operation.',
      response.status === 401 || response.status === 403 ? 403 : 502,
    );
  }
  return response;
}

async function installationToken(
  installationId: string,
  repositoryIds?: readonly string[],
): Promise<string> {
  const configuration = getGithubAppConfiguration();
  const response = await githubRequest(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      body: JSON.stringify({
        permissions: { contents: 'write' },
        ...(repositoryIds === undefined
          ? {}
          : { repository_ids: repositoryIds.map((id) => Number(id)) }),
      }),
      headers: {
        authorization: `Bearer ${appJwt(configuration)}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    },
    [201],
  );
  return InstallationTokenSchema.parse(await response.json()).token;
}

async function revokeInstallationToken(token: string): Promise<void> {
  try {
    await githubRequest(
      'https://api.github.com/installation/token',
      {
        headers: { authorization: `Bearer ${token}` },
        method: 'DELETE',
      },
      [204],
    );
  } catch {
    // Installation tokens expire after one hour. Failure to revoke must not
    // replace the primary operation result, and no token is persisted.
  }
}

function repositoryView(row: z.infer<typeof RepositoryResponseSchema>): WebsiteGithubRepository {
  return WebsiteGithubRepositorySchema.parse({
    defaultBranch: row.default_branch,
    fullName: row.full_name,
    id: String(row.id),
    private: row.private,
  });
}

export async function listGithubInstallationRepositories(
  installationId: string,
): Promise<readonly WebsiteGithubRepository[]> {
  const token = await installationToken(installationId);
  try {
    const repositories: WebsiteGithubRepository[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const response = await githubRequest(
        `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
        {
          headers: { authorization: `Bearer ${token}` },
          method: 'GET',
        },
      );
      const rows = RepositoryListSchema.parse(await response.json()).repositories;
      repositories.push(...rows.map(repositoryView));
      if (rows.length < 100) break;
    }
    return repositories.sort((left, right) => left.fullName.localeCompare(right.fullName));
  } finally {
    await revokeInstallationToken(token);
  }
}

export function githubAppInstallationUrl(appSlug: string, state: string): string {
  const url = new URL(`https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new`);
  url.searchParams.set('state', state);
  return url.toString();
}

export function githubOauthUrl(input: {
  readonly challenge: string;
  readonly clientId: string;
  readonly state: string;
}): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function createGithubOauthSecrets(): {
  readonly challenge: string;
  readonly state: string;
  readonly verifier: string;
} {
  const verifier = randomBytes(48).toString('base64url');
  return {
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    state: randomBytes(32).toString('base64url'),
    verifier,
  };
}

export async function exchangeGithubOauthCode(code: string, verifier: string): Promise<string> {
  const configuration = getGithubAppConfiguration();
  const response = await githubRequest('https://github.com/login/oauth/access_token', {
    body: JSON.stringify({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      code,
      code_verifier: verifier,
    }),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  return OAuthTokenSchema.parse(await response.json()).access_token;
}

export async function validateGithubInstallationForUser(
  accessToken: string,
  installationId: string,
): Promise<WebsiteGithubAccount> {
  for (let page = 1; page <= 5; page += 1) {
    const response = await githubRequest(
      `https://api.github.com/user/installations?per_page=100&page=${page}`,
      {
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'GET',
      },
    );
    const rows = UserInstallationsSchema.parse(await response.json()).installations;
    const installation = rows.find((row) => String(row.id) === installationId);
    if (installation !== undefined) {
      return WebsiteGithubAccountSchema.parse(installation.account);
    }
    if (rows.length < 100) break;
  }
  throw new GithubAppError(
    'GITHUB_INSTALLATION_FORBIDDEN',
    'The GitHub App installation is not available to the authorized user.',
    403,
  );
}

export async function revokeGithubUserToken(accessToken: string): Promise<void> {
  const configuration = getGithubAppConfiguration();
  try {
    await githubRequest(
      `https://api.github.com/applications/${encodeURIComponent(configuration.clientId)}/token`,
      {
        body: JSON.stringify({ access_token: accessToken }),
        headers: {
          authorization: `Basic ${Buffer.from(
            `${configuration.clientId}:${configuration.clientSecret}`,
          ).toString('base64')}`,
          'content-type': 'application/json',
        },
        method: 'DELETE',
      },
      [204],
    );
  } catch {
    // The user token is never persisted and expires according to the App policy.
  }
}

function branchPath(branch: string): string {
  return branch
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function repositoryPath(fullName: string): string {
  return fullName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function createBlob(
  token: string,
  repository: WebsiteGithubRepository,
  bytes: Uint8Array,
): Promise<string> {
  const response = await githubRequest(
    `https://api.github.com/repos/${repositoryPath(repository.fullName)}/git/blobs`,
    {
      body: JSON.stringify({
        content: Buffer.from(bytes).toString('base64'),
        encoding: 'base64',
      }),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    },
    [201],
  );
  return GitObjectSchema.parse(await response.json()).sha;
}

async function readManagedManifest(
  token: string,
  repository: WebsiteGithubRepository,
  branch: string,
): Promise<{ readonly projectId: string } | undefined> {
  const response = await githubRequest(
    `https://api.github.com/repos/${repositoryPath(
      repository.fullName,
    )}/contents/manifest.json?ref=${encodeURIComponent(branch)}`,
    {
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
    },
    [200, 404],
  );
  if (response.status === 404) return undefined;
  const content = ContentSchema.parse(await response.json());
  const value: unknown = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'));
  return z
    .object({ project: z.object({ id: z.string().uuid() }).passthrough() })
    .passthrough()
    .transform((manifest) => ({ projectId: manifest.project.id }))
    .parse(value);
}

export async function pushGithubStaticSource(input: {
  readonly branch: string;
  readonly installationId: string;
  readonly projectId: string;
  readonly repository: WebsiteGithubRepository;
  readonly source: WebsiteStaticSource;
  readonly version: number;
}): Promise<{ readonly commitSha: string; readonly commitUrl: string; readonly treeSha: string }> {
  const token = await installationToken(input.installationId, [input.repository.id]);
  try {
    const refResponse = await githubRequest(
      `https://api.github.com/repos/${repositoryPath(
        input.repository.fullName,
      )}/git/ref/heads/${branchPath(input.branch)}`,
      {
        headers: { authorization: `Bearer ${token}` },
        method: 'GET',
      },
      [200, 404],
    );
    const existingHead =
      refResponse.status === 404
        ? undefined
        : GitReferenceSchema.parse(await refResponse.json()).object.sha;
    if (existingHead !== undefined) {
      const manifest = await readManagedManifest(token, input.repository, input.branch);
      if (manifest?.projectId !== input.projectId) {
        throw new GithubAppError(
          'GITHUB_BRANCH_NOT_MANAGED',
          'The selected branch is not owned by this website project.',
          409,
        );
      }
    }

    const treeEntries = await Promise.all(
      input.source.files.map(async (file) => ({
        mode: '100644',
        path: file.path,
        sha: await createBlob(token, input.repository, file.bytes),
        type: 'blob',
      })),
    );
    const treeResponse = await githubRequest(
      `https://api.github.com/repos/${repositoryPath(input.repository.fullName)}/git/trees`,
      {
        body: JSON.stringify({ tree: treeEntries }),
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
      [201],
    );
    const treeSha = GitObjectSchema.parse(await treeResponse.json()).sha;
    const commitResponse = await githubRequest(
      `https://api.github.com/repos/${repositoryPath(input.repository.fullName)}/git/commits`,
      {
        body: JSON.stringify({
          message: `Publish ${input.projectId} website version ${input.version}`,
          ...(existingHead === undefined ? {} : { parents: [existingHead] }),
          tree: treeSha,
        }),
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
      [201],
    );
    const commit = GitCommitSchema.parse(await commitResponse.json());
    if (existingHead === undefined) {
      await githubRequest(
        `https://api.github.com/repos/${repositoryPath(input.repository.fullName)}/git/refs`,
        {
          body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: commit.sha }),
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          method: 'POST',
        },
        [201],
      );
    } else {
      await githubRequest(
        `https://api.github.com/repos/${repositoryPath(
          input.repository.fullName,
        )}/git/refs/heads/${branchPath(input.branch)}`,
        {
          body: JSON.stringify({ force: false, sha: commit.sha }),
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          method: 'PATCH',
        },
      );
    }
    return {
      commitSha: commit.sha,
      commitUrl: `https://github.com/${input.repository.fullName}/commit/${commit.sha}`,
      treeSha,
    };
  } finally {
    await revokeInstallationToken(token);
  }
}
