import { z } from 'zod';

import { AiGatewayError } from '../errors';
import type {
  AiChatAdapter,
  AiProviderAdapter,
  FetchTransport,
  ProviderChatEvent,
  ProviderChatRequest,
  ProviderCompletion,
  ProviderCompletionRequest,
} from '../types';
import { validateProviderConfig } from './config';
import { postJson, streamJsonEvents } from './http';

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

const AnthropicStreamEventSchema = z
  .object({
    delta: z
      .object({
        stop_reason: z.string().nullable().optional(),
        text: z.string().optional(),
        type: z.string().optional(),
      })
      .passthrough()
      .optional(),
    message: z
      .object({
        id: z.string().min(1),
        model: z.string().min(1),
        usage: z
          .object({
            input_tokens: z.number().int().min(0),
            output_tokens: z.number().int().min(0).optional(),
          })
          .passthrough(),
      })
      .passthrough()
      .optional(),
    type: z.string().min(1),
    usage: z
      .object({
        output_tokens: z.number().int().min(0).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface AnthropicAdapterOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchTransport?: FetchTransport;
  readonly model?: string;
}

export class AnthropicAdapter implements AiProviderAdapter, AiChatAdapter {
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

  async *streamChat(request: ProviderChatRequest): AsyncIterable<ProviderChatEvent> {
    let inputTokens = 0;
    let outputTokens = 0;
    let requestId: string | undefined;
    let responseModel = this.model;
    let stopReason: string | null | undefined;
    let completed = false;

    for await (const raw of streamJsonEvents({
      body: {
        max_tokens: request.chatRequest.maxOutputTokens,
        messages: request.messages.map((message) => ({
          content: message.content,
          role: message.role,
        })),
        model: this.model,
        stream: true,
        system: request.systemPrompt,
      },
      ...(this.fetchTransport === undefined ? {} : { fetchTransport: this.fetchTransport }),
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': this.apiKey,
      },
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      url: `${this.baseUrl}/v1/messages`,
    })) {
      const event = AnthropicStreamEventSchema.safeParse(raw);
      if (!event.success) {
        throw new AiGatewayError(
          'AI_PROVIDER_RESPONSE_INVALID',
          'Anthropic returned an unexpected streaming event.',
        );
      }
      if (event.data.type === 'message_start' && event.data.message !== undefined) {
        requestId = event.data.message.id;
        responseModel = event.data.message.model;
        inputTokens = event.data.message.usage.input_tokens;
        outputTokens = event.data.message.usage.output_tokens ?? 0;
        continue;
      }
      if (
        event.data.type === 'content_block_delta' &&
        event.data.delta?.type === 'text_delta' &&
        event.data.delta.text !== undefined
      ) {
        yield { text: event.data.delta.text, type: 'delta' };
        continue;
      }
      if (event.data.type === 'message_delta') {
        outputTokens = event.data.usage?.output_tokens ?? outputTokens;
        stopReason = event.data.delta?.stop_reason;
        continue;
      }
      if (event.data.type === 'error') {
        throw new AiGatewayError(
          'AI_PROVIDER_REQUEST_FAILED',
          'Anthropic streaming request failed.',
        );
      }
      if (event.data.type === 'message_stop') {
        if (stopReason === 'refusal' || stopReason === 'max_tokens') {
          throw new AiGatewayError(
            'AI_PROVIDER_RESPONSE_INVALID',
            `Anthropic chat response did not complete (${stopReason}).`,
          );
        }
        completed = true;
        yield {
          model: responseModel,
          ...(requestId === undefined ? {} : { requestId }),
          type: 'done',
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        };
      }
    }

    if (!completed) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'Anthropic stream ended before completion.',
      );
    }
  }

  async complete(request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const raw = await postJson({
      body: {
        max_tokens: request.maxOutputTokens,
        messages: [{ content: request.userPrompt, role: 'user' }],
        model: this.model,
        ...(request.operation === 'website_generation'
          ? {
              output_config: {
                format: {
                  schema: request.jsonSchema,
                  type: 'json_schema',
                },
              },
            }
          : {}),
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
