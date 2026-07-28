import { describe, expect, it } from 'vitest';

import { DEFAULT_AI_MODEL_MAPPINGS } from './ai-model-catalog';
import { buildAiTierOptions } from './ai-model-selection';
import {
  buildAssistantExactModelOptions,
  buildAssistantModelOptions,
  resolveAssistantProvider,
} from './assistant-models';
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
    });
    expect(options.find((option) => option.id === 'gemini')).toMatchObject({
      label: 'Gemini',
    });
    expect(options.every((option) => !('model' in option))).toBe(true);
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

  it('places every exact model in one plan-aware selection list', () => {
    const environment = parseEnvironment({
      ANTHROPIC_API_KEY: 'anthropic-secret-key-with-safe-length',
      GEMINI_API_KEY: 'gemini-secret-key-with-safe-length',
      NEXT_PUBLIC_MOCK_MODE: 'false',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-publishable-key',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      OPENAI_API_KEY: 'openai-secret-key-with-safe-length',
    });
    const choices = buildAssistantExactModelOptions(
      buildAssistantModelOptions(environment),
      buildAiTierOptions('free', DEFAULT_AI_MODEL_MAPPINGS),
    );

    expect(choices[0]).toMatchObject({
      enabled: true,
      id: 'auto',
      provider: 'auto',
      tier: 'auto',
    });
    expect(choices.find((choice) => choice.model === 'gpt-5.6-luna')).toMatchObject({
      enabled: true,
      id: 'openai:economy',
      provider: 'openai',
      tier: 'economy',
    });
    expect(choices.find((choice) => choice.model === 'claude-sonnet-5')).toMatchObject({
      enabled: false,
      id: 'anthropic:standard',
      provider: 'anthropic',
      tier: 'standard',
    });
    expect(choices.map((choice) => choice.model).filter(Boolean)).toContain(
      'gemini-3.1-pro-preview',
    );
  });
});
