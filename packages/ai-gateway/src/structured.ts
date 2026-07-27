import { z } from 'zod';

import { AiGatewayError } from './errors';
import type { AiProviderAdapter, ProviderTokenUsage, UsageRecord, UsageSink } from './types';
import { recordUsage } from './usage';

const StructuredOutputRequestSchema = z
  .object({
    maxOutputTokens: z.number().int().min(128).max(16_384),
    maxRepairAttempts: z.number().int().min(0).max(2).default(1),
    operation: z.literal('website_generation'),
    schemaName: z
      .string()
      .min(2)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/),
    systemPrompt: z.string().trim().min(10).max(12_000),
    userPrompt: z.string().trim().min(10).max(24_000),
  })
  .strict();

export interface StructuredOutputRequest<T> {
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly maxOutputTokens: number;
  readonly maxRepairAttempts?: number;
  readonly mockOutput?: unknown;
  readonly operation: 'website_generation';
  readonly outputSchema: z.ZodType<T>;
  readonly schemaName: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

export interface StructuredOutputResult<T> {
  readonly attempts: number;
  readonly model: string;
  readonly output: T;
  readonly provider: AiProviderAdapter['provider'];
  readonly usage: ProviderTokenUsage;
}

function addUsage(left: ProviderTokenUsage, right: ProviderTokenUsage): ProviderTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function validationPaths(error: z.ZodError): readonly string[] {
  return [
    ...new Set(
      error.issues.map((issue) => {
        const path = issue.path.map(String).join('.');
        return path.length === 0 ? '$' : path;
      }),
    ),
  ]
    .sort()
    .slice(0, 24);
}

function parseStrictOutput<T>(
  text: string,
  outputSchema: z.ZodType<T>,
): { readonly output?: T; readonly paths: readonly string[]; readonly success: boolean } {
  if (new TextEncoder().encode(text).byteLength > 1_000_000 || text.trimStart().startsWith('```')) {
    return { paths: ['$'], success: false };
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { paths: ['$'], success: false };
  }
  const parsed = outputSchema.safeParse(value);
  return parsed.success
    ? { output: parsed.data, paths: [], success: true }
    : { paths: validationPaths(parsed.error), success: false };
}

function repairPrompt(originalPrompt: string, paths: readonly string[]): string {
  return `${originalPrompt}

The previous response was rejected by server-side validation. Return a complete replacement JSON object only. Correct these invalid paths without discussing the prior response:
${paths.map((path) => `- ${path}`).join('\n')}`;
}

export class StructuredOutputGateway {
  constructor(
    private readonly adapter: AiProviderAdapter,
    private readonly usageSink: UsageSink,
  ) {}

  async generate<T>(
    input: StructuredOutputRequest<T>,
    signal?: AbortSignal,
  ): Promise<StructuredOutputResult<T>> {
    const request = StructuredOutputRequestSchema.safeParse({
      maxOutputTokens: input.maxOutputTokens,
      maxRepairAttempts: input.maxRepairAttempts ?? 1,
      operation: input.operation,
      schemaName: input.schemaName,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
    });
    if (!request.success) {
      throw new AiGatewayError('AI_REQUEST_INVALID', 'Structured AI request is invalid.', {
        details: {
          paths: request.error.issues.map((issue) => issue.path.map(String).join('.')),
        },
      });
    }

    let aggregateUsage: ProviderTokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    let priorPaths: readonly string[] = [];
    const maxAttempts = request.data.maxRepairAttempts + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      let completion;
      try {
        completion = await this.adapter.complete({
          attempt,
          jsonSchema: input.jsonSchema,
          maxOutputTokens: request.data.maxOutputTokens,
          ...(input.mockOutput === undefined ? {} : { mockOutput: input.mockOutput }),
          operation: request.data.operation,
          schemaName: request.data.schemaName,
          ...(signal === undefined ? {} : { signal }),
          systemPrompt: request.data.systemPrompt,
          userPrompt:
            attempt === 1
              ? request.data.userPrompt
              : repairPrompt(request.data.userPrompt, priorPaths),
        });
      } catch (error) {
        await this.record({
          attempt,
          durationMs: Math.max(0, Date.now() - startedAt),
          inputTokens: 0,
          model: this.adapter.model,
          operation: request.data.operation,
          outcome: 'failed',
          outputTokens: 0,
          provider: this.adapter.provider,
          validationCodes: [],
        });
        throw error;
      }

      aggregateUsage = addUsage(aggregateUsage, completion.usage);
      const validation = parseStrictOutput(completion.text, input.outputSchema);
      priorPaths = validation.paths;
      await this.record({
        attempt,
        durationMs: Math.max(0, Date.now() - startedAt),
        inputTokens: completion.usage.inputTokens,
        model: completion.model,
        operation: request.data.operation,
        outcome: validation.success ? 'succeeded' : 'invalid',
        outputTokens: completion.usage.outputTokens,
        provider: this.adapter.provider,
        validationCodes: validation.success ? [] : ['WEBSITE_SPEC_SCHEMA_INVALID'],
      });

      if (validation.success && validation.output !== undefined) {
        return {
          attempts: attempt,
          model: completion.model,
          output: validation.output,
          provider: this.adapter.provider,
          usage: aggregateUsage,
        };
      }
    }

    throw new AiGatewayError(
      'AI_OUTPUT_INVALID',
      'AI output did not pass structured validation within the repair limit.',
      {
        details: {
          attempts: maxAttempts,
          validationCodes: ['WEBSITE_SPEC_SCHEMA_INVALID'],
        },
      },
    );
  }

  private async record(record: UsageRecord): Promise<void> {
    await recordUsage(this.usageSink, record);
  }
}
