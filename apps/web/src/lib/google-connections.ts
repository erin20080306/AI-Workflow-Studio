import 'server-only';

import {
  GoogleConnectionService,
  GoogleOAuthClient,
  GoogleSheetsClient,
  GoogleSheetsError,
  GoogleTokenCipher,
  InMemoryGoogleConnectionRepository,
  InMemoryGoogleOperationStore,
  type GoogleConnectionView,
  type GoogleSheetSummary,
  type GoogleSpreadsheetSummary,
} from '@ai-workflow-studio/google-sheets';
import { z } from 'zod';

import { getWebActor } from './agent-server';
import { getEnvironment } from './env';

export const MOCK_GOOGLE_CONNECTION_ID = '10000000-0000-4000-8000-000000000911';
const MOCK_GOOGLE_CONNECTION: GoogleConnectionView = {
  id: MOCK_GOOGLE_CONNECTION_ID,
  lastHealthCheckAt: '2026-07-26T08:00:00.000Z',
  name: '營運報表（Mock）',
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
  readonly repository: InMemoryGoogleConnectionRepository;
  readonly service?: GoogleConnectionService;
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
  const repository = new InMemoryGoogleConnectionRepository();
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
  if (service === undefined || !getEnvironment().mockMode) {
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
  const savedConnections =
    environment.mockMode && environment.googleConfigured
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
  if (!getEnvironment().mockMode) {
    throw new GoogleSheetsError(
      'GOOGLE_NOT_CONFIGURED',
      'Authenticated production connection persistence is not configured.',
    );
  }
  const actor = await getWebActor();
  const tokens = await googleOAuthClient().exchangeCode(code, verifier, signal);
  return await googleConnectionService().create(
    actor.tenantId,
    actor.userId,
    `Google Sheets ${new Date().toISOString().slice(0, 10)}`,
    tokens,
  );
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
