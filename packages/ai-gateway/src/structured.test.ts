import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { StructuredOutputGateway } from './structured';
import type { AiProviderAdapter, ProviderCompletion, ProviderCompletionRequest } from './types';
import { InMemoryUsageSink } from './usage';

class StaticStructuredAdapter implements AiProviderAdapter {
  readonly model = 'structured-test-model';
  readonly provider = 'mock' as const;
  readonly requests: ProviderCompletionRequest[] = [];

  constructor(private readonly outputs: readonly string[]) {}

  async complete(request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    this.requests.push(request);
    return {
      model: this.model,
      text: this.outputs[Math.min(this.requests.length - 1, this.outputs.length - 1)] ?? '',
      usage: {
        inputTokens: 5,
        outputTokens: 7,
        totalTokens: 12,
      },
    };
  }
}

const outputSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(3).max(40),
  })
  .strict();

const request = {
  jsonSchema: {
    additionalProperties: false,
    properties: {
      schemaVersion: { const: 1, type: 'integer' },
      title: { type: 'string' },
    },
    required: ['schemaVersion', 'title'],
    type: 'object',
  },
  maxOutputTokens: 512,
  maxRepairAttempts: 1,
  operation: 'website_generation' as const,
  outputSchema,
  schemaName: 'website_spec_v1',
  systemPrompt: 'Return only validated website component JSON.',
  userPrompt: 'Create the validated website specification for this complete brief.',
};

describe('StructuredOutputGateway', () => {
  it('repairs invalid JSON with bounded validation paths and records website usage', async () => {
    const adapter = new StaticStructuredAdapter([
      '{"schemaVersion":1,"title":"x","secret":"must-not-be-repeated"}',
      '{"schemaVersion":1,"title":"Safe website"}',
    ]);
    const usage = new InMemoryUsageSink();
    const result = await new StructuredOutputGateway(adapter, usage).generate(request);

    expect(result.output.title).toBe('Safe website');
    expect(result.attempts).toBe(2);
    expect(result.usage.totalTokens).toBe(24);
    expect(adapter.requests[1]?.userPrompt).toContain('title');
    expect(adapter.requests[1]?.userPrompt).not.toContain('must-not-be-repeated');
    expect(usage.records.map((record) => [record.operation, record.outcome])).toEqual([
      ['website_generation', 'invalid'],
      ['website_generation', 'succeeded'],
    ]);
  });

  it('rejects fenced or invalid output after the repair bound', async () => {
    await expect(
      new StructuredOutputGateway(
        new StaticStructuredAdapter(['```json\n{"schemaVersion":1,"title":"Unsafe"}\n```']),
        new InMemoryUsageSink(),
      ).generate({ ...request, maxRepairAttempts: 0 }),
    ).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID',
      details: {
        attempts: 1,
        paths: ['$'],
        validationReason: 'fenced_or_too_large',
        validationCodes: ['WEBSITE_SPEC_SCHEMA_INVALID'],
      },
    });
  });
});
