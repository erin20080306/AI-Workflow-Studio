import 'server-only';

import type { WebActor } from '@ai-workflow-studio/agent-protocol';
import {
  GoogleConnectionService,
  GoogleOAuthClient,
  GoogleSheetsClient,
  GoogleSheetsError,
  GoogleTokenCipher,
  InMemoryGoogleConnectionRepository,
  InMemoryGoogleOperationStore,
  type GoogleConnectionRecord,
  type GoogleConnectionRepository,
  type GoogleConnectionStatus,
  type GoogleConnectionView,
  type GoogleSheetSummary,
  type GoogleSpreadsheetSummary,
} from '@ai-workflow-studio/google-sheets';
import { z } from 'zod';

import { getWebActor } from './agent-server';
import { getEnvironment } from './env';
import { assertGoogleConnectionUpgradeRole } from './google-oauth-reauthorization';
import { createSupabaseAdminClient } from './supabase/server';

export const MOCK_GOOGLE_CONNECTION_ID = '10000000-0000-4000-8000-000000000911';
const MOCK_GOOGLE_CONNECTION: GoogleConnectionView = {
  id: MOCK_GOOGLE_CONNECTION_ID,
  lastHealthCheckAt: '2026-07-26T08:00:00.000Z',
  name: '營運報表（Mock）',
  requiresReauthorization: false,
  scopes: [
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
  ],
  status: 'active',
};
const MOCK_SPREADSHEETS: readonly GoogleSpreadsheetSummary[] = [
  {
    id: '1MockOrdersSpreadsheet_1234567890',
    modifiedTime: '2026-07-26T07:30:00.000Z',
    name: '每日訂單彙整',
  },
  {
    id: '1MockOperationsSheet_1234567890',
    modifiedTime: '2026-07-25T09:10:00.000Z',
    name: '營運追蹤',
  },
];
const MOCK_SHEETS: readonly GoogleSheetSummary[] = [
  { columnCount: 12, rowCount: 3_200, sheetId: 0, title: 'Orders' },
  { columnCount: 8, rowCount: 420, sheetId: 7, title: 'Customers' },
];

const GoogleServerEnvironmentSchema = z
  .object({
    APP_ENCRYPTION_KEY: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().min(10).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(20).optional(),
    GOOGLE_REDIRECT_URI: z.string().url().optional(),
  })
  .passthrough();

interface GoogleServerState {
  readonly repository: GoogleConnectionRepository;
  readonly service?: GoogleConnectionService;
}

const GoogleConnectionRowSchema = z.object({
  created_at: z.iso.datetime({ offset: true }),
  created_by: z.string().uuid(),
  encrypted_access_token: z.string().nullable(),
  encrypted_refresh_token: z.string().nullable(),
  id: z.string().uuid(),
  last_error_code: z.string().max(120).nullable(),
  last_health_check_at: z.iso.datetime({ offset: true }).nullable(),
  name: z.string().min(1).max(120),
  scopes: z.array(z.string().min(1).max(300)).max(40),
  status: z.enum(['active', 'error', 'expired', 'revoked']),
  tenant_id: z.string().uuid(),
  token_expires_at: z.iso.datetime({ offset: true }).nullable(),
  updated_at: z.iso.datetime({ offset: true }),
});

function encryptedBytes(value: string | null): Uint8Array | undefined {
  return value === null ? undefined : Buffer.from(value, 'base64');
}

function googleConnectionFromRow(input: unknown): GoogleConnectionRecord {
  const row = GoogleConnectionRowSchema.parse(input);
  const encryptedAccessToken = encryptedBytes(row.encrypted_access_token);
  const encryptedRefreshToken = encryptedBytes(row.encrypted_refresh_token);
  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    ...(encryptedAccessToken === undefined ? {} : { encryptedAccessToken }),
    ...(encryptedRefreshToken === undefined ? {} : { encryptedRefreshToken }),
    id: row.id,
    ...(row.last_error_code === null ? {} : { lastErrorCode: row.last_error_code }),
    ...(row.last_health_check_at === null ? {} : { lastHealthCheckAt: row.last_health_check_at }),
    name: row.name,
    scopes: row.scopes,
    status: row.status,
    tenantId: row.tenant_id,
    ...(row.token_expires_at === null ? {} : { tokenExpiresAt: row.token_expires_at }),
    updatedAt: row.updated_at,
  };
}

class SupabaseGoogleConnectionRepository implements GoogleConnectionRepository {
  async create(record: GoogleConnectionRecord): Promise<void> {
    const result = await createSupabaseAdminClient()
      .from('google_workspace_connections')
      .insert({
        created_at: record.createdAt,
        created_by: record.createdBy,
        encrypted_access_token:
          record.encryptedAccessToken === undefined
            ? null
            : Buffer.from(record.encryptedAccessToken).toString('base64'),
        encrypted_refresh_token:
          record.encryptedRefreshToken === undefined
            ? null
            : Buffer.from(record.encryptedRefreshToken).toString('base64'),
        id: record.id,
        last_error_code: record.lastErrorCode ?? null,
        last_health_check_at: record.lastHealthCheckAt ?? null,
        name: record.name,
        scopes: [...record.scopes],
        status: record.status,
        tenant_id: record.tenantId,
        token_expires_at: record.tokenExpiresAt ?? null,
        updated_at: record.updatedAt,
      });
    if (result.error !== null) {
      throw new GoogleSheetsError(
        'GOOGLE_REQUEST_FAILED',
        'The Google Workspace connection could not be saved.',
      );
    }
  }

  async get(tenantId: string, connectionId: string): Promise<GoogleConnectionRecord | undefined> {
    const result = await createSupabaseAdminClient()
      .from('google_workspace_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', connectionId)
      .maybeSingle();
    if (result.error !== null) {
      throw new GoogleSheetsError(
        'GOOGLE_REQUEST_FAILED',
        'The Google Workspace connection could not be read.',
      );
    }
    return result.data === null ? undefined : googleConnectionFromRow(result.data);
  }

  async list(tenantId: string): Promise<readonly GoogleConnectionRecord[]> {
    const result = await createSupabaseAdminClient()
      .from('google_workspace_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (result.error !== null) {
      throw new GoogleSheetsError(
        'GOOGLE_REQUEST_FAILED',
        'Google Workspace connections could not be listed.',
      );
    }
    return z.array(GoogleConnectionRowSchema).parse(result.data).map(googleConnectionFromRow);
  }

  async revoke(tenantId: string, connectionId: string): Promise<void> {
    const result = await createSupabaseAdminClient()
      .from('google_workspace_connections')
      .update({
        encrypted_access_token: null,
        encrypted_refresh_token: null,
        status: 'revoked',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', connectionId);
    this.assertUpdated(result.error, 'The Google Workspace connection could not be revoked.');
  }

  async updateHealth(
    tenantId: string,
    connectionId: string,
    health: {
      readonly checkedAt: string;
      readonly errorCode?: string;
      readonly status: Exclude<GoogleConnectionStatus, 'revoked'>;
    },
  ): Promise<void> {
    const result = await createSupabaseAdminClient()
      .from('google_workspace_connections')
      .update({
        last_error_code: health.errorCode ?? null,
        last_health_check_at: health.checkedAt,
        status: health.status,
        updated_at: health.checkedAt,
      })
      .eq('tenant_id', tenantId)
      .eq('id', connectionId);
    this.assertUpdated(result.error, 'The Google Workspace health status could not be saved.');
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
    const result = await createSupabaseAdminClient()
      .from('google_workspace_connections')
      .update({
        encrypted_access_token: Buffer.from(tokens.encryptedAccessToken).toString('base64'),
        ...(tokens.encryptedRefreshToken === undefined
          ? {}
          : {
              encrypted_refresh_token: Buffer.from(tokens.encryptedRefreshToken).toString('base64'),
            }),
        last_error_code: null,
        scopes: [...tokens.scopes],
        status: 'active',
        token_expires_at: tokens.expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', connectionId);
    this.assertUpdated(result.error, 'The Google Workspace credentials could not be refreshed.');
  }

  private assertUpdated(error: { readonly message: string } | null, message: string): void {
    if (error !== null) {
      throw new GoogleSheetsError('GOOGLE_REQUEST_FAILED', message);
    }
  }
}

const googleGlobal = globalThis as typeof globalThis & {
  __aiWorkflowGoogleState?: GoogleServerState;
};

function googleConfiguration():
  | {
      readonly clientId: string;
      readonly clientSecret: string;
      readonly encryptionKey: string;
      readonly redirectUri: string;
    }
  | undefined {
  const parsed = GoogleServerEnvironmentSchema.safeParse(process.env);
  if (!parsed.success) {
    return undefined;
  }
  const environment = parsed.data;
  if (
    environment.APP_ENCRYPTION_KEY === undefined ||
    environment.GOOGLE_CLIENT_ID === undefined ||
    environment.GOOGLE_CLIENT_SECRET === undefined ||
    environment.GOOGLE_REDIRECT_URI === undefined ||
    Buffer.from(environment.APP_ENCRYPTION_KEY, 'base64').byteLength !== 32
  ) {
    return undefined;
  }
  return {
    clientId: environment.GOOGLE_CLIENT_ID,
    clientSecret: environment.GOOGLE_CLIENT_SECRET,
    encryptionKey: environment.APP_ENCRYPTION_KEY,
    redirectUri: environment.GOOGLE_REDIRECT_URI,
  };
}

function createState(): GoogleServerState {
  const repository: GoogleConnectionRepository = getEnvironment().mockMode
    ? new InMemoryGoogleConnectionRepository()
    : new SupabaseGoogleConnectionRepository();
  const configuration = googleConfiguration();
  if (configuration === undefined) {
    return { repository };
  }
  const oauth = new GoogleOAuthClient({
    clientId: configuration.clientId,
    clientSecret: configuration.clientSecret,
    redirectUri: configuration.redirectUri,
  });
  return {
    repository,
    service: new GoogleConnectionService({
      cipher: GoogleTokenCipher.fromBase64('primary', configuration.encryptionKey),
      client: new GoogleSheetsClient({
        operationStore: new InMemoryGoogleOperationStore(),
      }),
      oauth,
      repository,
    }),
  };
}

function state(): GoogleServerState {
  googleGlobal.__aiWorkflowGoogleState ??= createState();
  return googleGlobal.__aiWorkflowGoogleState;
}

export function googleOAuthClient(): GoogleOAuthClient {
  const configuration = googleConfiguration();
  if (configuration === undefined) {
    throw new GoogleSheetsError(
      'GOOGLE_NOT_CONFIGURED',
      'Google Sheets OAuth is not configured for this server.',
    );
  }
  return new GoogleOAuthClient({
    clientId: configuration.clientId,
    clientSecret: configuration.clientSecret,
    redirectUri: configuration.redirectUri,
  });
}

export function googleConnectionService(): GoogleConnectionService {
  const service = state().service;
  if (service === undefined) {
    throw new GoogleSheetsError(
      'GOOGLE_NOT_CONFIGURED',
      'The authenticated Google connection repository is not configured.',
    );
  }
  return service;
}

export async function googleConnectionPageState(): Promise<{
  readonly configured: boolean;
  readonly connections: readonly GoogleConnectionView[];
  readonly mockMode: boolean;
}> {
  const environment = getEnvironment();
  const savedConnections = environment.googleConfigured
    ? await googleConnectionService().list((await getWebActor()).tenantId)
    : [];
  return {
    configured: environment.googleConfigured,
    connections: environment.mockMode
      ? [MOCK_GOOGLE_CONNECTION, ...savedConnections]
      : savedConnections,
    mockMode: environment.mockMode,
  };
}

export async function listGoogleConnections(): Promise<readonly GoogleConnectionView[]> {
  if (getEnvironment().mockMode && !getEnvironment().googleConfigured) {
    return [MOCK_GOOGLE_CONNECTION];
  }
  const actor = await getWebActor();
  return await googleConnectionService().list(actor.tenantId);
}

export async function checkGoogleConnection(
  connectionId: string,
  signal?: AbortSignal,
): Promise<{
  readonly connection: GoogleConnectionView;
  readonly spreadsheets: readonly GoogleSpreadsheetSummary[];
}> {
  if (getEnvironment().mockMode && connectionId === MOCK_GOOGLE_CONNECTION_ID) {
    return {
      connection: {
        ...MOCK_GOOGLE_CONNECTION,
        lastHealthCheckAt: new Date().toISOString(),
      },
      spreadsheets: MOCK_SPREADSHEETS,
    };
  }
  const actor = await getWebActor();
  return await googleConnectionService().health(actor.tenantId, connectionId, signal);
}

export async function listGoogleSheets(
  connectionId: string,
  spreadsheetId: string,
  signal?: AbortSignal,
): Promise<readonly GoogleSheetSummary[]> {
  if (
    getEnvironment().mockMode &&
    connectionId === MOCK_GOOGLE_CONNECTION_ID &&
    MOCK_SPREADSHEETS.some((spreadsheet) => spreadsheet.id === spreadsheetId)
  ) {
    return MOCK_SHEETS;
  }
  const actor = await getWebActor();
  return await googleConnectionService().listSheets(
    actor.tenantId,
    connectionId,
    spreadsheetId,
    signal,
  );
}

export async function createGoogleConnectionFromCode(
  code: string,
  verifier: string,
  signal?: AbortSignal,
): Promise<GoogleConnectionView> {
  const actor = await getWebActor();
  const tokens = await googleOAuthClient().exchangeCode(code, verifier, signal);
  return await googleConnectionService().create(
    actor.tenantId,
    actor.userId,
    `Google Workspace ${new Date().toISOString().slice(0, 10)}`,
    tokens,
  );
}

export async function createUpgradedGoogleConnectionFromCode(
  actor: WebActor,
  connectionId: string,
  code: string,
  verifier: string,
  signal?: AbortSignal,
): Promise<GoogleConnectionView> {
  assertGoogleConnectionUpgradeRole(actor.role);
  const service = googleConnectionService();
  await service.assertUpgradeTarget(actor, connectionId);
  const tokens = await googleOAuthClient().exchangeCode(code, verifier, signal);
  return await service.createUpgrade(actor, connectionId, tokens);
}

export async function revokeGoogleConnection(
  connectionId: string,
  signal?: AbortSignal,
): Promise<void> {
  if (getEnvironment().mockMode && connectionId === MOCK_GOOGLE_CONNECTION_ID) {
    return;
  }
  const actor = await getWebActor();
  await googleConnectionService().revoke(actor.tenantId, connectionId, signal);
}
