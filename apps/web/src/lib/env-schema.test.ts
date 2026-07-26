import { describe, expect, it } from 'vitest';

import { parseEnvironment } from './env-schema';

describe('parseEnvironment', () => {
  it('uses safe mock mode when external credentials are absent', () => {
    expect(parseEnvironment({})).toMatchObject({
      googleConfigured: false,
      mockMode: true,
      providers: {
        anthropic: false,
        gemini: false,
        openai: false,
      },
      supabaseConfigured: false,
    });
  });

  it('allows live mode only with complete public Supabase configuration', () => {
    expect(
      parseEnvironment({
        NEXT_PUBLIC_MOCK_MODE: 'false',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
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
});
