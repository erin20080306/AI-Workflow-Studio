import { z } from 'zod';

import { AiGatewayError } from '../errors';
import { PLANNER_PROVIDER_JSON_SCHEMA } from '../provider-schema';
import type {
  AiProviderAdapter,
  FetchTransport,
  ProviderCompletion,
  ProviderCompletionRequest,
} from '../types';
import { validateProviderConfig } from './config';
import { postJson } from './http';

const AnthropicResponseSchema = z
  .object({
    content: z.array(
      z
        .object({
          text: z.string().optional(),
          type: z.string(),
        })
        .passthrough(),
    ),
    id: z.string().min(1),
    model: z.string().min(1),
    stop_reason: z.string().nullable(),
    usage: z.object({
      input_tokens: z.number().int().min(0),
      output_tokens: z.number().int().min(0),
    }),
  })
  .passthrough();

export interface AnthropicAdapterOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchTransport?: FetchTransport;
  readonly model?: string;
}

export class AnthropicAdapter implements AiProviderAdapter {
  readonly model: string;
  readonly provider = 'anthropic' as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchTransport: FetchTransport | undefined;

  constructor(options: AnthropicAdapterOptions) {
    const config = validateProviderConfig(
      {
        apiKey: options.apiKey,
        baseUrl: options.baseUrl ?? 'https://api.anthropic.com',
        model: options.model ?? 'claude-sonnet-4-6',
      },
      'Anthropic',
    );
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.fetchTransport = options.fetchTransport;
  }

  async complete(request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const raw = await postJson({
      body: {
        max_tokens: 12_000,
        messages: [{ content: request.userPrompt, role: 'user' }],
        model: this.model,
        output_config: {
          format: {
            schema: PLANNER_PROVIDER_JSON_SCHEMA,
            type: 'json_schema',
          },
        },
        system: request.systemPrompt,
      },
      ...(this.fetchTransport === undefined ? {} : { fetchTransport: this.fetchTransport }),
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': this.apiKey,
      },
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      url: `${this.baseUrl}/v1/messages`,
    });
    const parsed = AnthropicResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'Anthropic returned an unexpected response envelope.',
      );
    }
    if (parsed.data.stop_reason === 'refusal' || parsed.data.stop_reason === 'max_tokens') {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        `Anthropic planner output did not complete (${parsed.data.stop_reason}).`,
      );
    }
    const text = parsed.data.content
      .filter((content) => content.type === 'text' && content.text !== undefined)
      .map((content) => content.text ?? '')
      .join('');
    if (text.length === 0) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'Anthropic returned no planner output.',
      );
    }
    const inputTokens = parsed.data.usage.input_tokens;
    const outputTokens = parsed.data.usage.output_tokens;
    return {
      model: parsed.data.model,
      requestId: parsed.data.id,
      text,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }
}
