import { z } from 'zod';

import { AiGatewayError } from '../errors';
import type {
  AiProviderAdapter,
  FetchTransport,
  ProviderCompletion,
  ProviderCompletionRequest,
} from '../types';
import { validateProviderConfig } from './config';
import { postJson } from './http';

const OpenAiResponseSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    output: z.array(
      z
        .object({
          content: z.array(
            z.discriminatedUnion('type', [
              z.object({ text: z.string(), type: z.literal('output_text') }).passthrough(),
              z.object({ refusal: z.string(), type: z.literal('refusal') }).passthrough(),
            ]),
          ),
          type: z.string(),
        })
        .passthrough(),
    ),
    usage: z
      .object({
        input_tokens: z.number().int().min(0),
        output_tokens: z.number().int().min(0),
        total_tokens: z.number().int().min(0),
      })
      .optional(),
  })
  .passthrough();

export interface OpenAiAdapterOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchTransport?: FetchTransport;
  readonly model?: string;
}

export class OpenAiAdapter implements AiProviderAdapter {
  readonly model: string;
  readonly provider = 'openai' as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchTransport: FetchTransport | undefined;

  constructor(options: OpenAiAdapterOptions) {
    const config = validateProviderConfig(
      {
        apiKey: options.apiKey,
        baseUrl: options.baseUrl ?? 'https://api.openai.com',
        model: options.model ?? 'gpt-5.6-sol',
      },
      'OpenAI',
    );
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.fetchTransport = options.fetchTransport;
  }

  async complete(request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const raw = await postJson({
      body: {
        input: request.userPrompt,
        instructions: request.systemPrompt,
        max_output_tokens: 12_000,
        model: this.model,
        reasoning: { effort: 'medium' },
        store: false,
        text: {
          format: {
            type: 'json_object',
          },
        },
      },
      ...(this.fetchTransport === undefined ? {} : { fetchTransport: this.fetchTransport }),
      headers: {
        authorization: `Bearer ${this.apiKey}`,
      },
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      url: `${this.baseUrl}/v1/responses`,
    });
    const parsed = OpenAiResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'OpenAI returned an unexpected response envelope.',
      );
    }
    const refusal = parsed.data.output
      .flatMap((item) => item.content)
      .find((content) => content.type === 'refusal');
    if (refusal !== undefined) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'OpenAI refused the planning request.',
      );
    }
    const text = parsed.data.output
      .flatMap((item) => item.content)
      .filter((content) => content.type === 'output_text')
      .map((content) => content.text)
      .join('');
    if (text.length === 0) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'OpenAI returned no planner output.',
      );
    }
    const usage = parsed.data.usage;
    return {
      model: parsed.data.model,
      requestId: parsed.data.id,
      text,
      usage: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
    };
  }
}
