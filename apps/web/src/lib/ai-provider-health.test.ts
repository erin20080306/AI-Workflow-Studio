import { describe, expect, it, vi } from 'vitest';

import { probeAiProvider } from './ai-provider-health-probe';

describe('AI provider health probes', () => {
  it('lists accessible OpenAI models without exposing the key', async () => {
    const fetchTransport = vi.fn(async () =>
      Response.json({ data: [{ id: 'gpt-5.6-luna' }, { id: 'gpt-5.6-sol' }] }),
    );

    const health = await probeAiProvider(
      'openai',
      'sk-test-secret-that-is-long-enough',
      fetchTransport,
    );

    expect(health.status).toBe('available');
    expect(health.models).toEqual(['gpt-5.6-luna', 'gpt-5.6-sol']);
    expect(JSON.stringify(health)).not.toContain('sk-test');
    expect(fetchTransport).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer sk-test-secret-that-is-long-enough',
        }),
      }),
    );
  });

  it('normalizes Gemini model names and excludes non-generation models', async () => {
    const fetchTransport = vi.fn(async () =>
      Response.json({
        models: [
          {
            name: 'models/gemini-3.5-flash-lite',
            supportedGenerationMethods: ['generateContent'],
          },
          { name: 'models/text-embedding', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    );

    const health = await probeAiProvider(
      'gemini',
      'gemini-test-secret-that-is-long-enough',
      fetchTransport,
    );

    expect(health).toMatchObject({
      models: ['gemini-3.5-flash-lite'],
      provider: 'gemini',
      status: 'available',
    });
  });

  it.each([
    [401, 'authentication_failed'],
    [403, 'authentication_failed'],
    [429, 'rate_limited'],
    [500, 'unreachable'],
  ] as const)('maps HTTP %s to %s', async (status, expected) => {
    const health = await probeAiProvider(
      'anthropic',
      'anthropic-test-secret-that-is-long-enough',
      vi.fn(async () => new Response('', { status })),
    );

    expect(health.status).toBe(expected);
    expect(health.models).toEqual([]);
  });

  it('fails closed when a successful response has an invalid envelope', async () => {
    const health = await probeAiProvider(
      'anthropic',
      'anthropic-test-secret-that-is-long-enough',
      vi.fn(async () => Response.json({ models: [] })),
    );

    expect(health.status).toBe('unreachable');
  });
});
