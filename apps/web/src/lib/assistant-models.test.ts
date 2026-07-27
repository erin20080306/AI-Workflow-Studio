import { describe, expect, it } from 'vitest';

import { buildAssistantModelOptions, resolveAssistantProvider } from './assistant-models';
import { parseEnvironment } from './env-schema';

describe('assistant model catalog', () => {
  it('shows OpenAI, Claude, Gemini, and the development Mock model', () => {
    const options = buildAssistantModelOptions(parseEnvironment({}));

    expect(options.map((option) => option.id)).toEqual([
      'auto',
      'openai',
      'anthropic',
      'gemini',
      'mock',
    ]);
    expect(options.find((option) => option.id === 'anthropic')).toMatchObject({
      label: 'Claude',
      model: 'claude-sonnet-4-6',
    });
    expect(options.find((option) => option.id === 'gemini')).toMatchObject({
      label: 'Gemini',
      model: 'gemini-3.6-flash',
    });
  });

  it('routes Auto to the first configured live provider', () => {
    const options = buildAssistantModelOptions(
      parseEnvironment({
        ANTHROPIC_API_KEY: 'anthropic-secret-key-with-safe-length',
        GEMINI_API_KEY: 'gemini-secret-key-with-safe-length',
        NEXT_PUBLIC_MOCK_MODE: 'false',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-publishable-key',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      }),
    );

    expect(resolveAssistantProvider('auto', options)).toBe('anthropic');
    expect(resolveAssistantProvider('gemini', options)).toBe('gemini');
    expect(options.some((option) => option.id === 'mock')).toBe(false);
  });

  it('does not resolve an unconfigured provider', () => {
    const options = buildAssistantModelOptions(
      parseEnvironment({
        NEXT_PUBLIC_MOCK_MODE: 'false',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-publishable-key',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      }),
    );

    expect(resolveAssistantProvider('auto', options)).toBeUndefined();
    expect(resolveAssistantProvider('openai', options)).toBeUndefined();
  });
});
