import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

import { GoogleSheetsError } from './errors';
import type { GoogleFetch, GoogleOAuthTokens } from './types';

const TokenResponseSchema = z
  .object({
    access_token: z.string().min(20).max(20_000),
    expires_in: z.number().int().min(1).max(86_400),
    refresh_token: z.string().min(20).max(20_000).optional(),
    scope: z.string().max(4_000).default(''),
    token_type: z.string().toLowerCase().pipe(z.literal('bearer')),
  })
  .passthrough();

const MAX_RESPONSE_BYTES = 200_000;
export const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
] as const;
export const GOOGLE_APPS_SCRIPT_DEPLOYMENT_SCOPES = [
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
] as const;
export const GOOGLE_WORKSPACE_SCOPES = [
  ...GOOGLE_SHEETS_SCOPES,
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/presentations',
  ...GOOGLE_APPS_SCRIPT_DEPLOYMENT_SCOPES,
] as const;

export function hasRequiredGoogleWorkspaceScopes(scopes: readonly string[]): boolean {
  return GOOGLE_WORKSPACE_SCOPES.every((scope) => scopes.includes(scope));
}

export interface GoogleOAuthClientOptions {
  readonly authorizationUrl?: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetchTransport?: GoogleFetch;
  readonly now?: () => Date;
  readonly redirectUri: string;
  readonly revokeUrl?: string;
  readonly tokenUrl?: string;
}

export interface GooglePkcePair {
  readonly challenge: string;
  readonly verifier: string;
}

function validateEndpoint(input: string, label: string): string {
  const url = new URL(input);
  if (url.protocol !== 'https:') {
    throw new GoogleSheetsError('GOOGLE_NOT_CONFIGURED', `${label} must use HTTPS.`);
  }
  return url.toString();
}

async function responseText(response: Response): Promise<string> {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new GoogleSheetsError(
      'GOOGLE_RESPONSE_INVALID',
      'Google OAuth returned an oversized response.',
    );
  }
  return text;
}

export function createGooglePkcePair(): GooglePkcePair {
  const verifier = randomBytes(64).toString('base64url');
  return {
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    verifier,
  };
}

export class GoogleOAuthClient {
  private readonly authorizationEndpoint: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchTransport: GoogleFetch;
  private readonly now: () => Date;
  private readonly redirectUri: string;
  private readonly revokeUrl: string;
  private readonly tokenUrl: string;

  constructor(options: GoogleOAuthClientOptions) {
    if (options.clientId.length < 10 || options.clientSecret.length < 20) {
      throw new GoogleSheetsError(
        'GOOGLE_NOT_CONFIGURED',
        'Google OAuth client credentials are not configured.',
      );
    }
    this.authorizationEndpoint = validateEndpoint(
      options.authorizationUrl ?? 'https://accounts.google.com/o/oauth2/v2/auth',
      'Google authorization URL',
    );
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchTransport = options.fetchTransport ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.redirectUri = validateEndpoint(options.redirectUri, 'Google redirect URI');
    this.revokeUrl = validateEndpoint(
      options.revokeUrl ?? 'https://oauth2.googleapis.com/revoke',
      'Google revoke URL',
    );
    this.tokenUrl = validateEndpoint(
      options.tokenUrl ?? 'https://oauth2.googleapis.com/token',
      'Google token URL',
    );
  }

  authorizationUrl(state: string, challenge: string): string {
    if (!/^[A-Za-z0-9_-]{32,200}$/.test(state) || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
      throw new GoogleSheetsError(
        'GOOGLE_AUTHORIZATION_INVALID',
        'The OAuth state or PKCE challenge is invalid.',
      );
    }
    const url = new URL(this.authorizationEndpoint);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_WORKSPACE_SCOPES.join(' '));
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(
    code: string,
    verifier: string,
    signal?: AbortSignal,
  ): Promise<GoogleOAuthTokens> {
    if (code.length < 8 || code.length > 4_000 || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      throw new GoogleSheetsError(
        'GOOGLE_AUTHORIZATION_INVALID',
        'The Google authorization response is invalid.',
      );
    }
    const tokens = await this.tokenRequest(
      {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      },
      signal,
    );
    if (tokens.refreshToken === undefined) {
      throw new GoogleSheetsError(
        'GOOGLE_AUTHORIZATION_INVALID',
        'Google did not return the required offline refresh token.',
      );
    }
    return tokens;
  }

  async refresh(refreshToken: string, signal?: AbortSignal): Promise<GoogleOAuthTokens> {
    if (refreshToken.length < 20 || refreshToken.length > 20_000) {
      throw new GoogleSheetsError(
        'GOOGLE_TOKEN_REFRESH_FAILED',
        'The stored Google refresh token is invalid.',
      );
    }
    try {
      return await this.tokenRequest(
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        },
        signal,
      );
    } catch (error) {
      throw new GoogleSheetsError(
        'GOOGLE_TOKEN_REFRESH_FAILED',
        'The Google access token could not be refreshed.',
        { cause: error },
      );
    }
  }

  async revoke(token: string, signal?: AbortSignal): Promise<void> {
    const response = await this.fetchTransport(this.revokeUrl, {
      body: new URLSearchParams({ token }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      ...(signal === undefined ? {} : { signal }),
    });
    await responseText(response);
    if (!response.ok) {
      throw new GoogleSheetsError('GOOGLE_REQUEST_FAILED', 'Google credential revocation failed.', {
        retryable: response.status >= 500,
      });
    }
  }

  private async tokenRequest(
    values: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<GoogleOAuthTokens> {
    let response: Response;
    try {
      response = await this.fetchTransport(this.tokenUrl, {
        body: new URLSearchParams(values).toString(),
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      throw new GoogleSheetsError('GOOGLE_REQUEST_FAILED', 'Google OAuth could not be reached.', {
        cause: error,
        retryable: true,
      });
    }
    const text = await responseText(response);
    if (!response.ok) {
      throw new GoogleSheetsError(
        'GOOGLE_AUTHORIZATION_INVALID',
        'Google rejected the OAuth request.',
      );
    }
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      throw new GoogleSheetsError('GOOGLE_RESPONSE_INVALID', 'Google OAuth returned invalid JSON.');
    }
    const parsed = TokenResponseSchema.safeParse(value);
    if (!parsed.success) {
      throw new GoogleSheetsError(
        'GOOGLE_RESPONSE_INVALID',
        'Google OAuth returned an unexpected token response.',
      );
    }
    return {
      accessToken: parsed.data.access_token,
      expiresAt: new Date(this.now().getTime() + parsed.data.expires_in * 1_000).toISOString(),
      ...(parsed.data.refresh_token === undefined
        ? {}
        : { refreshToken: parsed.data.refresh_token }),
      scopes: parsed.data.scope.split(/\s+/).filter(Boolean),
    };
  }
}
