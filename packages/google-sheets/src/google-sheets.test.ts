import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { GoogleTokenCipher } from './cipher';
import { GoogleSheetsClient, InMemoryGoogleOperationStore, mergeSyncRows } from './client';
import { GoogleConnectionService, InMemoryGoogleConnectionRepository } from './connection';
import { GoogleSheetsError } from './errors';
import { GOOGLE_WORKSPACE_SCOPES, GoogleOAuthClient, createGooglePkcePair } from './oauth';
import type { GoogleFetch } from './types';

const TENANT_ID = '10000000-0000-4000-8000-000000000901';
const USER_ID = '10000000-0000-4000-8000-000000000902';
const CONNECTION_ID = '10000000-0000-4000-8000-000000000903';
const SPREADSHEET_ID = '1SpreadsheetFixture_1234567890';
const ACCESS_TOKEN = 'access-token-fixture-1234567890';
const REFRESH_TOKEN = 'refresh-token-fixture-1234567890';

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  });
}

function tokenCipher(): GoogleTokenCipher {
  return new GoogleTokenCipher('primary', {
    primary: Buffer.alloc(32, 7),
  });
}

function oauthClient(
  fetchTransport: GoogleFetch,
  now = () => new Date('2026-07-26T08:00:00.000Z'),
): GoogleOAuthClient {
  return new GoogleOAuthClient({
    authorizationUrl: 'https://accounts.example.test/oauth',
    clientId: 'google-client-id-fixture',
    clientSecret: 'google-client-secret-fixture-value',
    fetchTransport,
    now,
    redirectUri: 'https://app.example.test/api/connections/google/callback',
    revokeUrl: 'https://oauth.example.test/revoke',
    tokenUrl: 'https://oauth.example.test/token',
  });
}

describe('Google token encryption', () => {
  it('encrypts credentials with tenant/connection/type-bound AES-GCM context', () => {
    const cipher = tokenCipher();
    const encrypted = cipher.encrypt(REFRESH_TOKEN, {
      connectionId: CONNECTION_ID,
      kind: 'refresh',
      tenantId: TENANT_ID,
    });
    expect(encrypted.toString('utf8')).not.toContain(REFRESH_TOKEN);
    expect(
      cipher.decrypt(encrypted, {
        connectionId: CONNECTION_ID,
        kind: 'refresh',
        tenantId: TENANT_ID,
      }),
    ).toBe(REFRESH_TOKEN);
    expect(() =>
      cipher.decrypt(encrypted, {
        connectionId: CONNECTION_ID,
        kind: 'refresh',
        tenantId: '10000000-0000-4000-8000-000000000999',
      }),
    ).toThrowError(expect.objectContaining({ code: 'GOOGLE_TOKEN_ENCRYPTION_FAILED' }));
  });

  it('rejects keys that are not exactly 256 bits', () => {
    expect(() => new GoogleTokenCipher('bad', { bad: randomBytes(16) })).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_NOT_CONFIGURED' }),
    );
  });
});

describe('Google OAuth web-server flow', () => {
  it('uses state, PKCE S256, offline consent, and least-purpose scopes', () => {
    const oauth = oauthClient(async () => jsonResponse({}));
    const pkce = createGooglePkcePair();
    const state = randomBytes(32).toString('base64url');
    const url = new URL(oauth.authorizationUrl(state, pkce.challenge));

    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(pkce.challenge);
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(GOOGLE_WORKSPACE_SCOPES);
    expect(url.toString()).not.toContain('google-client-secret-fixture-value');
  });

  it('exchanges, refreshes, and revokes through server-side form requests', async () => {
    const requests: { readonly body: string; readonly url: string }[] = [];
    const fetchTransport: GoogleFetch = async (input, init) => {
      const url = String(input);
      requests.push({ body: String(init?.body ?? ''), url });
      if (url.endsWith('/revoke')) {
        return new Response('', { status: 200 });
      }
      const isRefresh = String(init?.body).includes('grant_type=refresh_token');
      return jsonResponse({
        access_token: isRefresh ? 'refreshed-access-token-1234567890' : ACCESS_TOKEN,
        expires_in: 3600,
        ...(isRefresh ? {} : { refresh_token: REFRESH_TOKEN }),
        scope: GOOGLE_WORKSPACE_SCOPES.join(' '),
        token_type: 'Bearer',
      });
    };
    const oauth = oauthClient(fetchTransport);
    const pair = createGooglePkcePair();
    const exchanged = await oauth.exchangeCode('authorization-code-fixture', pair.verifier);
    expect(exchanged).toMatchObject({
      accessToken: ACCESS_TOKEN,
      expiresAt: '2026-07-26T09:00:00.000Z',
      refreshToken: REFRESH_TOKEN,
    });
    const refreshed = await oauth.refresh(REFRESH_TOKEN);
    expect(refreshed.accessToken).toBe('refreshed-access-token-1234567890');
    await oauth.revoke(REFRESH_TOKEN);

    expect(requests[0]?.body).toContain('code_verifier=');
    expect(requests[0]?.body).toContain('client_secret=google-client-secret-fixture-value');
    expect(requests[1]?.body).toContain('grant_type=refresh_token');
    expect(requests[2]).toMatchObject({
      body: expect.stringContaining('token=refresh-token-fixture'),
      url: 'https://oauth.example.test/revoke',
    });
  });
});

describe('Google Sheets REST client', () => {
  it('lists metadata and retries bounded reads without exposing authorization in URLs', async () => {
    const calls: { readonly authorization: string | null; readonly url: string }[] = [];
    let readAttempts = 0;
    const sleeps: number[] = [];
    const client = new GoogleSheetsClient({
      driveBaseUrl: 'https://drive.example.test/v3',
      fetchTransport: async (input, init) => {
        const url = String(input);
        calls.push({
          authorization: new Headers(init?.headers).get('authorization'),
          url,
        });
        if (url.includes('drive.example.test')) {
          return jsonResponse({
            files: [
              {
                id: SPREADSHEET_ID,
                modifiedTime: '2026-07-26T07:00:00.000Z',
                name: 'Orders',
              },
            ],
          });
        }
        if (url.includes('?fields=sheets')) {
          return jsonResponse({
            sheets: [
              {
                properties: {
                  gridProperties: { columnCount: 4, rowCount: 20 },
                  sheetId: 7,
                  title: 'Orders',
                },
              },
            ],
          });
        }
        readAttempts += 1;
        return readAttempts === 1
          ? jsonResponse({ error: {} }, 429, { 'retry-after': '1' })
          : jsonResponse({
              range: 'Orders!A1:B2',
              values: [
                ['id', 'amount'],
                ['A-1', 10],
              ],
            });
      },
      operationStore: new InMemoryGoogleOperationStore(),
      random: () => 0,
      sheetsBaseUrl: 'https://sheets.example.test/v4',
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    await expect(client.listSpreadsheets(ACCESS_TOKEN)).resolves.toEqual([
      {
        id: SPREADSHEET_ID,
        modifiedTime: '2026-07-26T07:00:00.000Z',
        name: 'Orders',
      },
    ]);
    await expect(client.listSheets(ACCESS_TOKEN, SPREADSHEET_ID)).resolves.toEqual([
      { columnCount: 4, rowCount: 20, sheetId: 7, title: 'Orders' },
    ]);
    await expect(client.read(ACCESS_TOKEN, SPREADSHEET_ID, 'Orders!A1:B2')).resolves.toEqual({
      range: 'Orders!A1:B2',
      values: [
        ['id', 'amount'],
        ['A-1', 10],
      ],
    });
    expect(sleeps).toEqual([1_000]);
    expect(calls.every((call) => call.authorization === `Bearer ${ACCESS_TOKEN}`)).toBe(true);
    expect(calls.every((call) => !call.url.includes(ACCESS_TOKEN))).toBe(true);
  });

  it('batches idempotent updates and replays a completed result without a second write', async () => {
    let attempts = 0;
    const client = new GoogleSheetsClient({
      fetchTransport: async () => {
        attempts += 1;
        return jsonResponse({
          spreadsheetId: SPREADSHEET_ID,
          totalUpdatedCells: 4,
          totalUpdatedColumns: 2,
          totalUpdatedRows: 2,
        });
      },
      operationStore: new InMemoryGoogleOperationStore(),
    });
    const operation = () =>
      client.batchUpdate(
        ACCESS_TOKEN,
        CONNECTION_ID,
        SPREADSHEET_ID,
        [
          {
            range: 'Orders!A1:B2',
            values: [
              ['id', 'amount'],
              ['A-1', 10],
            ],
          },
        ],
        'workflow-run:step-1',
      );
    const first = await operation();
    const duplicate = await operation();
    expect(first).toEqual(duplicate);
    expect(attempts).toBe(1);
  });

  it('maps permission failures to a safe authorization error', async () => {
    const client = new GoogleSheetsClient({
      fetchTransport: async () =>
        jsonResponse(
          {
            error: {
              message: `upstream must not echo ${ACCESS_TOKEN}`,
            },
          },
          403,
        ),
      operationStore: new InMemoryGoogleOperationStore(),
    });

    await expect(client.read(ACCESS_TOKEN, SPREADSHEET_ID, 'Orders!A1:B2')).rejects.toMatchObject({
      code: 'GOOGLE_AUTHORIZATION_INVALID',
      message: 'Google rejected the connection authorization.',
    });
  });

  it('never automatically retries an ambiguous append', async () => {
    let attempts = 0;
    const client = new GoogleSheetsClient({
      fetchTransport: async () => {
        attempts += 1;
        throw new Error('connection reset after send');
      },
      operationStore: new InMemoryGoogleOperationStore(),
    });
    await expect(
      client.append(
        ACCESS_TOKEN,
        CONNECTION_ID,
        SPREADSHEET_ID,
        'Orders!A:B',
        [['A-1', 10]],
        'workflow-run:append-1',
      ),
    ).rejects.toMatchObject({ code: 'GOOGLE_REQUEST_AMBIGUOUS' });
    await expect(
      client.append(
        ACCESS_TOKEN,
        CONNECTION_ID,
        SPREADSHEET_ID,
        'Orders!A:B',
        [['A-1', 10]],
        'workflow-run:append-1',
      ),
    ).rejects.toMatchObject({ code: 'GOOGLE_IDEMPOTENCY_CONFLICT' });
    expect(attempts).toBe(1);
  });

  it('merges sync rows deterministically for source, destination, and fail strategies', () => {
    const existing = [
      ['id', 'amount'],
      ['A-1', 10],
      ['B-2', 20],
    ] as const;
    const sourceWins = mergeSyncRows(existing, {
      conflictStrategy: 'source_wins',
      headers: ['id', 'amount'],
      keyColumns: ['id'],
      rows: [
        { amount: 15, id: 'A-1' },
        { amount: 30, id: 'C-3' },
      ],
    });
    expect(sourceWins).toEqual([
      ['id', 'amount'],
      ['A-1', 15],
      ['B-2', 20],
      ['C-3', 30],
    ]);
    expect(
      mergeSyncRows(existing, {
        conflictStrategy: 'destination_wins',
        headers: ['id', 'amount'],
        keyColumns: ['id'],
        rows: [{ amount: 15, id: 'A-1' }],
      }),
    ).toEqual(existing);
    expect(() =>
      mergeSyncRows(existing, {
        conflictStrategy: 'fail',
        headers: ['id', 'amount'],
        keyColumns: ['id'],
        rows: [{ amount: 15, id: 'A-1' }],
      }),
    ).toThrowError(expect.objectContaining({ code: 'GOOGLE_IDEMPOTENCY_CONFLICT' }));
  });
});

describe('Google connection service', () => {
  it('stores only encrypted credentials, refreshes expiry, reports health, and clears on revoke', async () => {
    const repository = new InMemoryGoogleConnectionRepository();
    const cipher = tokenCipher();
    let tokenRequests = 0;
    const oauth = oauthClient(async (input) => {
      const url = String(input);
      if (url.endsWith('/revoke')) {
        return new Response('', { status: 200 });
      }
      tokenRequests += 1;
      return jsonResponse({
        access_token: 'service-refreshed-access-token-12345',
        expires_in: 3600,
        scope: GOOGLE_WORKSPACE_SCOPES.join(' '),
        token_type: 'Bearer',
      });
    });
    const sheetsClient = new GoogleSheetsClient({
      fetchTransport: async () => jsonResponse({ files: [] }),
      operationStore: new InMemoryGoogleOperationStore(),
    });
    const now = () => new Date('2026-07-26T08:00:00.000Z');
    const service = new GoogleConnectionService({
      cipher,
      client: sheetsClient,
      now,
      oauth,
      repository,
    });
    await service.create(
      TENANT_ID,
      USER_ID,
      'Operations Sheets',
      {
        accessToken: ACCESS_TOKEN,
        expiresAt: '2026-07-26T07:59:00.000Z',
        refreshToken: REFRESH_TOKEN,
        scopes: GOOGLE_WORKSPACE_SCOPES,
      },
      CONNECTION_ID,
    );
    const stored = await repository.get(TENANT_ID, CONNECTION_ID);
    expect(Buffer.from(stored?.encryptedRefreshToken ?? []).toString('utf8')).not.toContain(
      REFRESH_TOKEN,
    );
    expect(JSON.stringify(await service.list(TENANT_ID))).not.toContain('Token');

    await expect(service.health(TENANT_ID, CONNECTION_ID)).resolves.toMatchObject({
      connection: {
        lastHealthCheckAt: '2026-07-26T08:00:00.000Z',
        status: 'active',
      },
      spreadsheets: [],
    });
    expect(tokenRequests).toBe(1);

    await service.revoke(TENANT_ID, CONNECTION_ID);
    const revoked = await repository.get(TENANT_ID, CONNECTION_ID);
    expect(revoked).toMatchObject({ status: 'revoked' });
    expect(revoked?.encryptedAccessToken).toBeUndefined();
    expect(revoked?.encryptedRefreshToken).toBeUndefined();
    await expect(service.accessToken(TENANT_ID, CONNECTION_ID)).rejects.toBeInstanceOf(
      GoogleSheetsError,
    );
  });
});
