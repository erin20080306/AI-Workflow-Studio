import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  assertGoogleConnectionUpgradeCallbackRole,
  assertGoogleConnectionUpgradeStartRole,
  createGoogleOAuthState,
  createGoogleReauthorizationBinding,
  parseGoogleReauthorizationTarget,
  resolveGoogleReauthorizationTarget,
  verifyGoogleReauthorizationBinding,
} from './google-oauth-reauthorization';

const CONNECTION_ID = '10000000-0000-4000-8000-000000000903';
const OTHER_CONNECTION_ID = '10000000-0000-4000-8000-000000000904';
const RANDOM_STATE = 'state_with_256_bits_of_random_entropy_1234567890';
const STATE = createGoogleOAuthState(RANDOM_STATE, true);

describe('Google OAuth reauthorization route binding', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('binds the tenant-validated target to the exact OAuth state with a server signature', () => {
    vi.stubEnv('APP_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));

    const binding = createGoogleReauthorizationBinding(STATE, CONNECTION_ID);

    expect(verifyGoogleReauthorizationBinding(STATE, binding)).toBe(CONNECTION_ID);
    expect(() => verifyGoogleReauthorizationBinding(`${STATE}changed`, binding)).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_AUTHORIZATION_INVALID' }),
    );
    expect(() =>
      verifyGoogleReauthorizationBinding(
        STATE,
        binding.replace(CONNECTION_ID, OTHER_CONNECTION_ID),
      ),
    ).toThrowError(expect.objectContaining({ code: 'GOOGLE_AUTHORIZATION_INVALID' }));
  });

  it('allows only owner and admin roles through both start and callback guards', () => {
    for (const guard of [
      assertGoogleConnectionUpgradeStartRole,
      assertGoogleConnectionUpgradeCallbackRole,
    ]) {
      expect(() => guard('owner')).not.toThrow();
      expect(() => guard('admin')).not.toThrow();
      expect(() => guard('editor')).toThrowError(
        expect.objectContaining({ code: 'GOOGLE_AUTHORIZATION_INVALID' }),
      );
      expect(() => guard('viewer')).toThrowError(
        expect.objectContaining({ code: 'GOOGLE_AUTHORIZATION_INVALID' }),
      );
    }
  });

  it('fails closed if a reauthorization state loses its binding or a new state gains one', () => {
    vi.stubEnv('APP_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));
    const newConnectionState = createGoogleOAuthState(RANDOM_STATE, false);
    const binding = createGoogleReauthorizationBinding(STATE, CONNECTION_ID);

    expect(resolveGoogleReauthorizationTarget(STATE, binding)).toBe(CONNECTION_ID);
    expect(resolveGoogleReauthorizationTarget(newConnectionState, undefined)).toBeUndefined();
    expect(resolveGoogleReauthorizationTarget(RANDOM_STATE, undefined)).toBeUndefined();
    expect(() => resolveGoogleReauthorizationTarget(STATE, undefined)).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_AUTHORIZATION_INVALID' }),
    );
    expect(() => resolveGoogleReauthorizationTarget(newConnectionState, binding)).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_AUTHORIZATION_INVALID' }),
    );
  });

  it('rejects malformed or ambiguously repeated reauthorization query targets', () => {
    const startUrl = 'https://app.example.test/api/connections/google/start';

    expect(parseGoogleReauthorizationTarget(startUrl)).toBeUndefined();
    expect(parseGoogleReauthorizationTarget(`${startUrl}?connectionId=${CONNECTION_ID}`)).toBe(
      CONNECTION_ID,
    );
    expect(() =>
      parseGoogleReauthorizationTarget(`${startUrl}?connectionId=not-a-uuid`),
    ).toThrowError(expect.objectContaining({ code: 'GOOGLE_AUTHORIZATION_INVALID' }));
    expect(() =>
      parseGoogleReauthorizationTarget(
        `${startUrl}?connectionId=${CONNECTION_ID}&connectionId=${OTHER_CONNECTION_ID}`,
      ),
    ).toThrowError(expect.objectContaining({ code: 'GOOGLE_AUTHORIZATION_INVALID' }));
  });

  it('fails closed when the server signing key is absent or invalid', () => {
    vi.stubEnv('APP_ENCRYPTION_KEY', Buffer.alloc(16, 3).toString('base64'));
    expect(() => createGoogleReauthorizationBinding(STATE, CONNECTION_ID)).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_NOT_CONFIGURED' }),
    );
  });
});
