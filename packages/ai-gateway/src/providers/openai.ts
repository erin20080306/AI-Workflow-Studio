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

const OpenAiResponseSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    output: z.array(
      z
        .object({
          content: z
            .array(
              z.discriminatedUnion('type', [
                z.object({ text: z.string(), type: z.literal('output_text') }).passthrough(),
                z.object({ refusal: z.string(), type: z.literal('refusal') }).passthrough(),
              ]),
            )
            .optional(),
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
      .nullish(),
  })
  .passthrough();

const OpenAiStreamEventSchema = z
  .object({
    delta: z.string().optional(),
    response: z
      .object({
        id: z.string().min(1),
        model: z.string().min(1),
        usage: z
          .object({
            input_tokens: z.number().int().min(0),
            output_tokens: z.number().int().min(0),
            total_tokens: z.number().int().min(0),
          })
          .nullish(),
      })
      .passthrough()
      .optional(),
    type: z.string().min(1),
  })
  .passthrough();

const OpenAiStreamFailureSchema = z
  .object({
    code: z.union([z.number(), z.string()]).nullish(),
    error: z
      .object({
        code: z.union([z.number(), z.string()]).nullish(),
        param: z.string().nullish(),
        type: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    param: z.string().nullish(),
    response: z
      .object({
        error: z
          .object({
            code: z.union([z.number(), z.string()]).nullish(),
            param: z.string().nullish(),
            type: z.string().nullish(),
          })
          .passthrough()
          .nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

function openAiStreamFailureDetails(raw: unknown): Readonly<Record<string, unknown>> {
  const parsed = OpenAiStreamFailureSchema.safeParse(raw);
  if (!parsed.success) return {};
  const nested = parsed.data.error ?? parsed.data.response?.error;
  const details: Record<string, unknown> = {};
  const providerCode = parsed.data.code ?? nested?.code;
  const providerParam = parsed.data.param ?? nested?.param;
  if (providerCode !== null && providerCode !== undefined) {
    details.providerCode = providerCode;
  }
  if (providerParam !== null && providerParam !== undefined) {
    details.providerParam = providerParam;
  }
  if (nested?.type !== null && nested?.type !== undefined) {
    details.providerType = nested.type;
  }
  return details;
}

export interface OpenAiAdapterOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchTransport?: FetchTransport;
  readonly model?: string;
  readonly reasoningEffort?: 'high' | 'low' | 'medium';
}

export class OpenAiAdapter implements AiProviderAdapter, AiChatAdapter {
  readonly model: string;
  readonly provider = 'openai' as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchTransport: FetchTransport | undefined;
  private readonly reasoningEffort: 'high' | 'low' | 'medium';

  private reasoningConfig():
    | Readonly<{ reasoning: { effort: 'high' | 'low' | 'medium' } }>
    | {
        readonly reasoning?: never;
      } {
    return /^gpt-5(?:[.-]|$)/.test(this.model)
      ? { reasoning: { effort: this.reasoningEffort } }
      : {};
  }

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
    this.reasoningEffort = options.reasoningEffort ?? 'medium';
  }

  async *streamChat(request: ProviderChatRequest): AsyncIterable<ProviderChatEvent> {
    let completed = false;
    for await (const raw of streamJsonEvents({
      body: {
        input: request.messages.map((message) => ({
          content: message.content,
          role: message.role,
        })),
        instructions: request.systemPrompt,
        max_output_tokens: request.chatRequest.maxOutputTokens,
        model: this.model,
        ...this.reasoningConfig(),
        store: false,
        stream: true,
      },
      ...(this.fetchTransport === undefined ? {} : { fetchTransport: this.fetchTransport }),
      headers: {
        authorization: `Bearer ${this.apiKey}`,
      },
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      url: `${this.baseUrl}/v1/responses`,
    })) {
      const event = OpenAiStreamEventSchema.safeParse(raw);
      if (!event.success) {
        const eventType =
          typeof raw === 'object' && raw !== null && 'type' in raw && typeof raw.type === 'string'
            ? raw.type
            : 'unknown';
        throw new AiGatewayError(
          'AI_PROVIDER_RESPONSE_INVALID',
          'OpenAI returned an unexpected streaming event.',
          { details: { eventType } },
        );
      }
      if (event.data.type === 'response.output_text.delta') {
        if (event.data.delta !== undefined && event.data.delta.length > 0) {
          yield { text: event.data.delta, type: 'delta' };
        }
        continue;
      }
      if (event.data.type === 'error' || event.data.type === 'response.failed') {
        const failureDetails = openAiStreamFailureDetails(raw);
        const details: Readonly<Record<string, unknown>> = {
          eventType: event.data.type,
          ...failureDetails,
        };
        throw new AiGatewayError(
          failureDetails.providerCode === 'insufficient_quota'
            ? 'AI_PROVIDER_QUOTA_EXCEEDED'
            : 'AI_PROVIDER_REQUEST_FAILED',
          failureDetails.providerCode === 'insufficient_quota'
            ? 'OpenAI account quota is exhausted.'
            : 'OpenAI streaming request failed.',
          {
            details,
          },
        );
      }
      if (event.data.type === 'response.completed') {
        const response = event.data.response;
        if (response === undefined) {
          throw new AiGatewayError(
            'AI_PROVIDER_RESPONSE_INVALID',
            'OpenAI completion event did not include a response.',
          );
        }
        completed = true;
        const usage = response.usage;
        yield {
          model: response.model,
          requestId: response.id,
          type: 'done',
          usage: {
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
            totalTokens: usage?.total_tokens ?? 0,
          },
        };
      }
    }
    if (!completed) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'OpenAI stream ended before completion.',
      );
    }
  }

  async complete(request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const format =
      request.operation === 'workflow_plan'
        ? { type: 'json_object' as const }
        : {
            name: request.schemaName,
            schema: request.jsonSchema,
            strict: true,
            type: 'json_schema' as const,
          };
    const raw = await postJson({
      body: {
        input: request.userPrompt,
        instructions: request.systemPrompt,
        max_output_tokens: request.maxOutputTokens,
        model: this.model,
        ...this.reasoningConfig(),
        store: false,
        text: {
          format,
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
      .flatMap((item) => item.content ?? [])
      .find((content) => content.type === 'refusal');
    if (refusal !== undefined) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'OpenAI refused the planning request.',
      );
    }
    const text = parsed.data.output
      .flatMap((item) => item.content ?? [])
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
