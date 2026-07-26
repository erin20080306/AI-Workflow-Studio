import { describe, expect, it } from 'vitest';

import { hasSupabasePublicConfiguration, parseSupabasePublicConfiguration } from './config';

describe('Supabase public configuration', () => {
  it('prefers the current publishable key', () => {
    expect(
      parseSupabasePublicConfiguration({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable',
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).toEqual({
      key: 'publishable',
      url: 'https://project.supabase.co',
    });
  });

  it('supports the legacy anonymous key and rejects incomplete configuration', () => {
    expect(
      hasSupabasePublicConfiguration({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon',
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).toBe(true);
    expect(hasSupabasePublicConfiguration({})).toBe(false);
  });
});
