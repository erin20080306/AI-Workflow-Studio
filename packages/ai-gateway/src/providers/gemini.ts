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

const GeminiResponseSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            content: z
              .object({
                parts: z.array(z.object({ text: z.string() }).passthrough()),
              })
              .passthrough(),
            finishReason: z.string().optional(),
          })
          .passthrough(),
      )
      .min(1),
    modelVersion: z.string().optional(),
    responseId: z.string().optional(),
    usageMetadata: z
      .object({
        candidatesTokenCount: z.number().int().min(0).optional(),
        promptTokenCount: z.number().int().min(0).optional(),
        totalTokenCount: z.number().int().min(0).optional(),
      })
      .optional(),
  })
  .passthrough();

const unusableFinishReasons = new Set([
  'BLOCKLIST',
  'MAX_TOKENS',
  'PROHIBITED_CONTENT',
  'RECITATION',
  'SAFETY',
  'SPII',
]);

export interface GeminiAdapterOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchTransport?: FetchTransport;
  readonly model?: string;
}

export class GeminiAdapter implements AiProviderAdapter, AiChatAdapter {
  readonly model: string;
  readonly provider = 'gemini' as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchTransport: FetchTransport | undefined;

  constructor(options: GeminiAdapterOptions) {
    const config = validateProviderConfig(
      {
        apiKey: options.apiKey,
        baseUrl: options.baseUrl ?? 'https://generativelanguage.googleapis.com',
        model: options.model ?? 'gemini-3.6-flash',
      },
      'Gemini',
    );
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.fetchTransport = options.fetchTransport;
  }

  async *streamChat(request: ProviderChatRequest): AsyncIterable<ProviderChatEvent> {
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let requestId: string | undefined;
    let responseModel = this.model;
    let receivedEvent = false;

    for await (const raw of streamJsonEvents({
      body: {
        contents: request.messages.map((message) => ({
          parts: [{ text: message.content }],
          role: message.role === 'assistant' ? 'model' : 'user',
        })),
        generationConfig: {
          maxOutputTokens: request.chatRequest.maxOutputTokens,
        },
        systemInstruction: {
          parts: [{ text: request.systemPrompt }],
        },
      },
      ...(this.fetchTransport === undefined ? {} : { fetchTransport: this.fetchTransport }),
      headers: {
        'x-goog-api-key': this.apiKey,
      },
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      url: `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`,
    })) {
      const event = GeminiResponseSchema.safeParse(raw);
      if (!event.success) {
        throw new AiGatewayError(
          'AI_PROVIDER_RESPONSE_INVALID',
          'Gemini returned an unexpected streaming event.',
        );
      }
      receivedEvent = true;
      const candidate = event.data.candidates[0];
      if (
        candidate === undefined ||
        (candidate.finishReason !== undefined && unusableFinishReasons.has(candidate.finishReason))
      ) {
        throw new AiGatewayError(
          'AI_PROVIDER_RESPONSE_INVALID',
          'Gemini did not return a usable chat response.',
        );
      }
      const text = candidate.content.parts.map((part) => part.text).join('');
      if (text.length > 0) {
        yield { text, type: 'delta' };
      }
      const usage = event.data.usageMetadata;
      inputTokens = usage?.promptTokenCount ?? inputTokens;
      outputTokens = usage?.candidatesTokenCount ?? outputTokens;
      totalTokens = usage?.totalTokenCount ?? totalTokens;
      requestId = event.data.responseId ?? requestId;
      responseModel = event.data.modelVersion ?? responseModel;
    }

    if (!receivedEvent) {
      throw new AiGatewayError('AI_PROVIDER_RESPONSE_INVALID', 'Gemini returned an empty stream.');
    }
    yield {
      model: responseModel,
      ...(requestId === undefined ? {} : { requestId }),
      type: 'done',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: totalTokens || inputTokens + outputTokens,
      },
    };
  }

  async complete(request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const usePromptedPortableSchema = request.schemaName.startsWith('website_blueprint_');
    const generationConfig = {
      maxOutputTokens: request.maxOutputTokens,
      responseMimeType: 'application/json',
      ...(request.operation === 'website_generation' && !usePromptedPortableSchema
        ? { responseJsonSchema: request.jsonSchema }
        : {}),
    };
    const userPrompt = usePromptedPortableSchema
      ? `${request.userPrompt}

Return one JSON object matching this compact schema. Every required field must be present and valid; unknown properties are ignored by the safe server compiler:
${JSON.stringify(request.jsonSchema)}`
      : request.userPrompt;
    const raw = await postJson({
      body: {
        contents: [
          {
            parts: [{ text: userPrompt }],
            role: 'user',
          },
        ],
        generationConfig,
        systemInstruction: {
          parts: [{ text: request.systemPrompt }],
        },
      },
      ...(this.fetchTransport === undefined ? {} : { fetchTransport: this.fetchTransport }),
      headers: {
        'x-goog-api-key': this.apiKey,
      },
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      url: `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
    });
    const parsed = GeminiResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'Gemini returned an unexpected response envelope.',
      );
    }
    const candidate = parsed.data.candidates[0];
    if (
      candidate === undefined ||
      (candidate.finishReason !== undefined && unusableFinishReasons.has(candidate.finishReason))
    ) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'Gemini did not return a usable planner output.',
      );
    }
    const text = candidate.content.parts.map((part) => part.text).join('');
    if (text.length === 0) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'Gemini returned no planner output.',
      );
    }
    const usage = parsed.data.usageMetadata;
    return {
      model: parsed.data.modelVersion ?? this.model,
      ...(parsed.data.responseId === undefined ? {} : { requestId: parsed.data.responseId }),
      text,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
    };
  }
}
