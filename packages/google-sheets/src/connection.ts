import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { GoogleTokenCipher } from './cipher';
import { GoogleSheetsClient } from './client';
import { GoogleSheetsError } from './errors';
import { GOOGLE_SHEETS_SCOPES, GoogleOAuthClient } from './oauth';
import type { GoogleOAuthTokens, GoogleSheetSummary, GoogleSpreadsheetSummary } from './types';

const UuidSchema = z.string().uuid();
const NameSchema = z.string().trim().min(1).max(120);

export type GoogleConnectionStatus = 'active' | 'error' | 'expired' | 'revoked';

export interface GoogleConnectionRecord {
  readonly createdAt: string;
  readonly createdBy: string;
  readonly encryptedAccessToken?: Uint8Array;
  readonly encryptedRefreshToken?: Uint8Array;
  readonly id: string;
  readonly lastErrorCode?: string;
  readonly lastHealthCheckAt?: string;
  readonly name: string;
  readonly scopes: readonly string[];
  readonly status: GoogleConnectionStatus;
  readonly tenantId: string;
  readonly tokenExpiresAt?: string;
  readonly updatedAt: string;
}

export interface GoogleConnectionView {
  readonly id: string;
  readonly lastErrorCode?: string;
  readonly lastHealthCheckAt?: string;
  readonly name: string;
  readonly scopes: readonly string[];
  readonly status: GoogleConnectionStatus;
}

export interface GoogleConnectionRepository {
  create(record: GoogleConnectionRecord): Promise<void>;
  get(tenantId: string, connectionId: string): Promise<GoogleConnectionRecord | undefined>;
  list(tenantId: string): Promise<readonly GoogleConnectionRecord[]>;
  revoke(tenantId: string, connectionId: string): Promise<void>;
  updateHealth(
    tenantId: string,
    connectionId: string,
    health: {
      readonly checkedAt: string;
      readonly errorCode?: string;
      readonly status: 'active' | 'error' | 'expired';
    },
  ): Promise<void>;
  updateTokens(
    tenantId: string,
    connectionId: string,
    tokens: {
      readonly encryptedAccessToken: Uint8Array;
      readonly encryptedRefreshToken?: Uint8Array;
      readonly expiresAt: string;
      readonly scopes: readonly string[];
    },
  ): Promise<void>;
}

function toView(record: GoogleConnectionRecord): GoogleConnectionView {
  return {
    id: record.id,
    ...(record.lastErrorCode === undefined ? {} : { lastErrorCode: record.lastErrorCode }),
    ...(record.lastHealthCheckAt === undefined
      ? {}
      : { lastHealthCheckAt: record.lastHealthCheckAt }),
    name: record.name,
    scopes: record.scopes,
    status: record.status,
  };
}

export class InMemoryGoogleConnectionRepository implements GoogleConnectionRepository {
  private readonly records = new Map<string, GoogleConnectionRecord>();

  async create(record: GoogleConnectionRecord): Promise<void> {
    if (this.records.has(record.id)) {
      throw new GoogleSheetsError(
        'GOOGLE_REQUEST_INVALID',
        'The Google connection already exists.',
      );
    }
    this.records.set(record.id, structuredClone(record));
  }

  async get(tenantId: string, connectionId: string): Promise<GoogleConnectionRecord | undefined> {
    const record = this.records.get(connectionId);
    return record?.tenantId === tenantId ? structuredClone(record) : undefined;
  }

  async list(tenantId: string): Promise<readonly GoogleConnectionRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.tenantId === tenantId)
      .map((record) => structuredClone(record));
  }

  async revoke(tenantId: string, connectionId: string): Promise<void> {
    const record = await this.require(tenantId, connectionId);
    const {
      encryptedAccessToken: _encryptedAccessToken,
      encryptedRefreshToken: _encryptedRefreshToken,
      ...withoutTokens
    } = record;
    void _encryptedAccessToken;
    void _encryptedRefreshToken;
    this.records.set(connectionId, {
      ...withoutTokens,
      status: 'revoked',
      updatedAt: new Date().toISOString(),
    });
  }

  async updateHealth(
    tenantId: string,
    connectionId: string,
    health: {
      readonly checkedAt: string;
      readonly errorCode?: string;
      readonly status: 'active' | 'error' | 'expired';
    },
  ): Promise<void> {
    const record = await this.require(tenantId, connectionId);
    const { lastErrorCode: _lastErrorCode, ...withoutError } = record;
    void _lastErrorCode;
    this.records.set(connectionId, {
      ...withoutError,
      ...(health.errorCode === undefined ? {} : { lastErrorCode: health.errorCode }),
      lastHealthCheckAt: health.checkedAt,
      status: health.status,
      updatedAt: health.checkedAt,
    });
  }

  async updateTokens(
    tenantId: string,
    connectionId: string,
    tokens: {
      readonly encryptedAccessToken: Uint8Array;
      readonly encryptedRefreshToken?: Uint8Array;
      readonly expiresAt: string;
      readonly scopes: readonly string[];
    },
  ): Promise<void> {
    const record = await this.require(tenantId, connectionId);
    this.records.set(connectionId, {
      ...record,
      encryptedAccessToken: Buffer.from(tokens.encryptedAccessToken),
      ...(tokens.encryptedRefreshToken === undefined
        ? {}
        : { encryptedRefreshToken: Buffer.from(tokens.encryptedRefreshToken) }),
      scopes: [...tokens.scopes],
      status: 'active',
      tokenExpiresAt: tokens.expiresAt,
      updatedAt: new Date().toISOString(),
    });
  }

  private async require(tenantId: string, connectionId: string): Promise<GoogleConnectionRecord> {
    const record = await this.get(tenantId, connectionId);
    if (record === undefined) {
      throw new GoogleSheetsError(
        'GOOGLE_CONNECTION_REVOKED',
        'The Google Sheets connection is unavailable.',
      );
    }
    return record;
  }
}

export interface GoogleConnectionServiceOptions {
  readonly cipher: GoogleTokenCipher;
  readonly client: GoogleSheetsClient;
  readonly now?: () => Date;
  readonly oauth: GoogleOAuthClient;
  readonly repository: GoogleConnectionRepository;
}

export class GoogleConnectionService {
  private readonly cipher: GoogleTokenCipher;
  private readonly client: GoogleSheetsClient;
  private readonly now: () => Date;
  private readonly oauth: GoogleOAuthClient;
  private readonly repository: GoogleConnectionRepository;

  constructor(options: GoogleConnectionServiceOptions) {
    this.cipher = options.cipher;
    this.client = options.client;
    this.now = options.now ?? (() => new Date());
    this.oauth = options.oauth;
    this.repository = options.repository;
  }

  async create(
    tenantIdInput: string,
    createdByInput: string,
    nameInput: string,
    tokens: GoogleOAuthTokens,
    connectionIdInput = randomUUID(),
  ): Promise<GoogleConnectionView> {
    const tenantId = UuidSchema.parse(tenantIdInput);
    const createdBy = UuidSchema.parse(createdByInput);
    const connectionId = UuidSchema.parse(connectionIdInput);
    const name = NameSchema.parse(nameInput);
    if (
      tokens.refreshToken === undefined ||
      !GOOGLE_SHEETS_SCOPES.every((scope) => tokens.scopes.includes(scope))
    ) {
      throw new GoogleSheetsError(
        'GOOGLE_AUTHORIZATION_INVALID',
        'The Google authorization is missing required offline scopes.',
      );
    }
    const now = this.now().toISOString();
    const record: GoogleConnectionRecord = {
      createdAt: now,
      createdBy,
      encryptedAccessToken: this.cipher.encrypt(tokens.accessToken, {
        connectionId,
        kind: 'access',
        tenantId,
      }),
      encryptedRefreshToken: this.cipher.encrypt(tokens.refreshToken, {
        connectionId,
        kind: 'refresh',
        tenantId,
      }),
      id: connectionId,
      name,
      scopes: [...tokens.scopes],
      status: 'active',
      tenantId,
      tokenExpiresAt: tokens.expiresAt,
      updatedAt: now,
    };
    await this.repository.create(record);
    return toView(record);
  }

  async list(tenantIdInput: string): Promise<readonly GoogleConnectionView[]> {
    const tenantId = UuidSchema.parse(tenantIdInput);
    return (await this.repository.list(tenantId)).map(toView);
  }

  async health(
    tenantId: string,
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly connection: GoogleConnectionView;
    readonly spreadsheets: readonly GoogleSpreadsheetSummary[];
  }> {
    try {
      const accessToken = await this.accessToken(tenantId, connectionId, signal);
      const spreadsheets = await this.client.listSpreadsheets(accessToken, signal);
      const checkedAt = this.now().toISOString();
      await this.repository.updateHealth(tenantId, connectionId, {
        checkedAt,
        status: 'active',
      });
      const record = await this.requireConnection(tenantId, connectionId);
      return { connection: toView(record), spreadsheets };
    } catch (error) {
      const checkedAt = this.now().toISOString();
      const errorCode = error instanceof GoogleSheetsError ? error.code : 'GOOGLE_REQUEST_FAILED';
      await this.repository
        .updateHealth(tenantId, connectionId, {
          checkedAt,
          errorCode,
          status:
            errorCode === 'GOOGLE_TOKEN_REFRESH_FAILED' ||
            errorCode === 'GOOGLE_AUTHORIZATION_INVALID'
              ? 'expired'
              : 'error',
        })
        .catch(() => undefined);
      throw error;
    }
  }

  async listSheets(
    tenantId: string,
    connectionId: string,
    spreadsheetId: string,
    signal?: AbortSignal,
  ): Promise<readonly GoogleSheetSummary[]> {
    return await this.client.listSheets(
      await this.accessToken(tenantId, connectionId, signal),
      spreadsheetId,
      signal,
    );
  }

  async revoke(tenantId: string, connectionId: string, signal?: AbortSignal): Promise<void> {
    const connection = await this.requireConnection(tenantId, connectionId);
    try {
      if (connection.encryptedRefreshToken !== undefined) {
        await this.oauth.revoke(
          this.cipher.decrypt(connection.encryptedRefreshToken, {
            connectionId,
            kind: 'refresh',
            tenantId,
          }),
          signal,
        );
      }
    } finally {
      await this.repository.revoke(tenantId, connectionId);
    }
  }

  async accessToken(tenantId: string, connectionId: string, signal?: AbortSignal): Promise<string> {
    const connection = await this.requireConnection(tenantId, connectionId);
    if (connection.status === 'revoked') {
      throw new GoogleSheetsError(
        'GOOGLE_CONNECTION_REVOKED',
        'The Google Sheets connection is revoked.',
      );
    }
    if (
      connection.encryptedAccessToken !== undefined &&
      connection.tokenExpiresAt !== undefined &&
      new Date(connection.tokenExpiresAt).getTime() > this.now().getTime() + 60_000
    ) {
      return this.cipher.decrypt(connection.encryptedAccessToken, {
        connectionId,
        kind: 'access',
        tenantId,
      });
    }
    if (connection.encryptedRefreshToken === undefined) {
      throw new GoogleSheetsError(
        'GOOGLE_TOKEN_REFRESH_FAILED',
        'The Google Sheets connection has no refresh credential.',
      );
    }
    const refreshToken = this.cipher.decrypt(connection.encryptedRefreshToken, {
      connectionId,
      kind: 'refresh',
      tenantId,
    });
    const tokens = await this.oauth.refresh(refreshToken, signal);
    await this.repository.updateTokens(tenantId, connectionId, {
      encryptedAccessToken: this.cipher.encrypt(tokens.accessToken, {
        connectionId,
        kind: 'access',
        tenantId,
      }),
      ...(tokens.refreshToken === undefined
        ? {}
        : {
            encryptedRefreshToken: this.cipher.encrypt(tokens.refreshToken, {
              connectionId,
              kind: 'refresh',
              tenantId,
            }),
          }),
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes.length > 0 ? tokens.scopes : connection.scopes,
    });
    return tokens.accessToken;
  }

  private async requireConnection(
    tenantIdInput: string,
    connectionIdInput: string,
  ): Promise<GoogleConnectionRecord> {
    const tenantId = UuidSchema.parse(tenantIdInput);
    const connectionId = UuidSchema.parse(connectionIdInput);
    const connection = await this.repository.get(tenantId, connectionId);
    if (connection === undefined) {
      throw new GoogleSheetsError(
        'GOOGLE_CONNECTION_REVOKED',
        'The Google Sheets connection is unavailable.',
      );
    }
    return connection;
  }
}
