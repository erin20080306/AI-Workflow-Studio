import { describe, expect, it } from 'vitest';

import { parseEnvironment } from './env-schema';

describe('parseEnvironment', () => {
  it('uses safe mock mode when external credentials are absent', () => {
    expect(parseEnvironment({})).toMatchObject({
      googleConfigured: false,
      mockMode: true,
      microsoftStore: {
        configured: false,
        planMappings: [],
      },
      providers: {
        anthropic: false,
        gemini: false,
        openai: false,
      },
      providerModels: {
        anthropic: 'claude-sonnet-4-6',
        gemini: 'gemini-3.6-flash',
        mock: 'mock-planner-v1',
        openai: 'gpt-5.6-sol',
      },
      supabaseConfigured: false,
    });
  });

  it('allows live mode only with complete public Supabase configuration', () => {
    expect(
      parseEnvironment({
        NEXT_PUBLIC_MOCK_MODE: 'false',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-publishable-key',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      }),
    ).toMatchObject({
      mockMode: false,
      supabaseConfigured: true,
    });
  });

  it('rejects malformed URLs without exposing their values', () => {
    expect(() =>
      parseEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
      }),
    ).toThrowError('Invalid environment configuration: NEXT_PUBLIC_SUPABASE_URL');
  });

  it('accepts safe model overrides and rejects values that look like paths', () => {
    expect(
      parseEnvironment({
        OPENAI_MODEL: 'gpt-5.6-terra',
      }).providerModels.openai,
    ).toBe('gpt-5.6-terra');

    expect(() => parseEnvironment({ OPENAI_MODEL: '../../unsafe' })).toThrowError(
      'Invalid environment configuration: OPENAI_MODEL',
    );
  });

  it('enables Google only with complete OAuth settings and a 256-bit base64 key', () => {
    expect(
      parseEnvironment({
        APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret-with-safe-length',
        GOOGLE_REDIRECT_URI: 'https://app.example.test/api/connections/google/callback',
      }).googleConfigured,
    ).toBe(true);

    expect(() =>
      parseEnvironment({
        APP_ENCRYPTION_KEY: 'not-a-valid-encryption-key',
      }),
    ).toThrowError('Invalid environment configuration: APP_ENCRYPTION_KEY');
  });

  it('enables Microsoft Store only with complete server credentials and plan mappings', () => {
    expect(
      parseEnvironment({
        MICROSOFT_STORE_CLIENT_ID: '11111111-1111-4111-8111-111111111111',
        MICROSOFT_STORE_CLIENT_SECRET: 'server-secret-with-safe-length',
        MICROSOFT_STORE_PLAN_MAPPINGS: JSON.stringify([
          { plan: 'pro', productId: '9PRODUCT', skuId: 'monthly' },
        ]),
        MICROSOFT_STORE_TENANT_ID: '22222222-2222-4222-8222-222222222222',
      }).microsoftStore,
    ).toEqual({
      configured: true,
      planMappings: [{ plan: 'pro', productId: '9PRODUCT', skuId: 'monthly' }],
    });

    expect(() =>
      parseEnvironment({
        MICROSOFT_STORE_PLAN_MAPPINGS: '[{"plan":"unlimited"}]',
      }),
    ).toThrowError('Invalid environment configuration: MICROSOFT_STORE_PLAN_MAPPINGS');
  });
});
