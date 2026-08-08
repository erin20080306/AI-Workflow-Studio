import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { GoogleSheetsError } from '@ai-workflow-studio/google-sheets';
import { z } from 'zod';

export const GOOGLE_OAUTH_CALLBACK_PATH = '/api/connections/google/callback';
export const GOOGLE_OAUTH_COOKIES = {
  reauthorization: 'aiws_google_oauth_reauthorization',
  state: 'aiws_google_oauth_state',
  verifier: 'aiws_google_oauth_verifier',
} as const;
export const GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

const ConnectionIdSchema = z.string().uuid();
const OAuthStateSchema = z.string().regex(/^[A-Za-z0-9_-]{32,200}$/);
const SignatureSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const BINDING_VERSION = 'v1';
const NEW_STATE_PREFIX = 'new_';
const REAUTHORIZATION_STATE_PREFIX = 'reauthorize_';
const SIGNING_CONTEXT = 'ai-workflow-studio:google-reauthorization:v1';

function authorizationInvalid(): GoogleSheetsError {
  return new GoogleSheetsError(
    'GOOGLE_AUTHORIZATION_INVALID',
    'The Google reauthorization state is invalid or expired.',
  );
}

export function assertGoogleConnectionUpgradeRole(
  role: 'owner' | 'admin' | 'editor' | 'viewer',
): void {
  if (role !== 'owner' && role !== 'admin') {
    throw new GoogleSheetsError(
      'GOOGLE_AUTHORIZATION_INVALID',
      'Only a tenant owner or administrator can upgrade a Google connection.',
    );
  }
}

export function assertGoogleConnectionUpgradeStartRole(
  role: 'owner' | 'admin' | 'editor' | 'viewer',
): void {
  assertGoogleConnectionUpgradeRole(role);
}

export function assertGoogleConnectionUpgradeCallbackRole(
  role: 'owner' | 'admin' | 'editor' | 'viewer',
): void {
  assertGoogleConnectionUpgradeRole(role);
}

function signingKey(): Buffer {
  const encoded = process.env.APP_ENCRYPTION_KEY;
  if (encoded === undefined) {
    throw new GoogleSheetsError(
      'GOOGLE_NOT_CONFIGURED',
      'Google OAuth reauthorization signing is not configured.',
    );
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.byteLength !== 32) {
    throw new GoogleSheetsError(
      'GOOGLE_NOT_CONFIGURED',
      'Google OAuth reauthorization signing is not configured.',
    );
  }
  return key;
}

function signature(state: string, connectionId: string): string {
  return createHmac('sha256', signingKey())
    .update(`${SIGNING_CONTEXT}\0${state}\0${connectionId}`, 'utf8')
    .digest('base64url');
}

export function parseGoogleReauthorizationTarget(requestUrl: string): string | undefined {
  const values = new URL(requestUrl).searchParams.getAll('connectionId');
  if (values.length === 0) return undefined;
  if (values.length !== 1) throw authorizationInvalid();
  const parsed = ConnectionIdSchema.safeParse(values[0]);
  if (!parsed.success) throw authorizationInvalid();
  return parsed.data;
}

export function createGoogleOAuthState(randomValue: string, reauthorization: boolean): string {
  const randomState = OAuthStateSchema.parse(randomValue);
  return OAuthStateSchema.parse(
    `${reauthorization ? REAUTHORIZATION_STATE_PREFIX : NEW_STATE_PREFIX}${randomState}`,
  );
}

export function googleOAuthStateRequiresReauthorization(stateInput: string): boolean {
  const state = OAuthStateSchema.safeParse(stateInput);
  if (!state.success) throw authorizationInvalid();
  return state.data.startsWith(REAUTHORIZATION_STATE_PREFIX);
}

export function createGoogleReauthorizationBinding(
  stateInput: string,
  connectionIdInput: string,
): string {
  const state = OAuthStateSchema.parse(stateInput);
  const connectionId = ConnectionIdSchema.parse(connectionIdInput);
  return `${BINDING_VERSION}.${connectionId}.${signature(state, connectionId)}`;
}

export function verifyGoogleReauthorizationBinding(stateInput: string, binding: string): string {
  const state = OAuthStateSchema.safeParse(stateInput);
  const parts = binding.split('.');
  const version = parts[0];
  const connectionId = ConnectionIdSchema.safeParse(parts[1]);
  const providedSignature = SignatureSchema.safeParse(parts[2]);
  if (
    !state.success ||
    parts.length !== 3 ||
    version !== BINDING_VERSION ||
    !connectionId.success ||
    !providedSignature.success
  ) {
    throw authorizationInvalid();
  }
  const expected = Buffer.from(signature(state.data, connectionId.data));
  const provided = Buffer.from(providedSignature.data);
  if (expected.byteLength !== provided.byteLength || !timingSafeEqual(expected, provided)) {
    throw authorizationInvalid();
  }
  return connectionId.data;
}

export function resolveGoogleReauthorizationTarget(
  state: string,
  binding: string | undefined,
): string | undefined {
  const requiresReauthorization = googleOAuthStateRequiresReauthorization(state);
  if (requiresReauthorization !== (binding !== undefined)) throw authorizationInvalid();
  return binding === undefined ? undefined : verifyGoogleReauthorizationBinding(state, binding);
}
