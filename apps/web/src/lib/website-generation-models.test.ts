import { describe, expect, it } from 'vitest';

import { parseEnvironment } from './env-schema';
import {
  buildWebsiteGenerationModelOptions,
  resolveWebsiteGenerationProvider,
} from './website-generation-models';

describe('Website Studio model catalog', () => {
  it('shows only available choices and never includes key or model status fields', () => {
    const environment = parseEnvironment({});
    const options = buildWebsiteGenerationModelOptions(environment);

    expect(options.map((option) => option.id)).toEqual(['auto', 'mock']);
    expect(options.find((option) => option.id === 'mock')).toMatchObject({
      label: 'Mock Studio',
      level: { en: 'Development', zhHant: '開發測試' },
    });
    expect(JSON.stringify(options)).not.toContain('API_KEY');
    expect(JSON.stringify(options)).not.toContain('configured');
    expect(JSON.stringify(options)).not.toContain('gpt-');
  });

  it('routes Auto by policy and excludes unconfigured live providers', () => {
    const environment = parseEnvironment({
      ANTHROPIC_API_KEY: 'anthropic-secret-key-with-safe-length',
      GEMINI_API_KEY: 'gemini-secret-key-with-safe-length',
      NEXT_PUBLIC_MOCK_MODE: 'false',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-publishable-key',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    });
    const options = buildWebsiteGenerationModelOptions(environment);

    expect(options.map((option) => option.id)).toEqual(['auto', 'anthropic', 'gemini']);
    expect(resolveWebsiteGenerationProvider('auto', environment)).toBe('anthropic');
    expect(resolveWebsiteGenerationProvider('openai', environment)).toBeUndefined();
    expect(resolveWebsiteGenerationProvider('gemini', environment)).toBe('gemini');
  });
});
