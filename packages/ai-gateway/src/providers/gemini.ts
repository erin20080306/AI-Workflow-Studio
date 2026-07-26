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

export class GeminiAdapter implements AiProviderAdapter {
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

  async complete(request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const raw = await postJson({
      body: {
        contents: [
          {
            parts: [{ text: request.userPrompt }],
            role: 'user',
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: PLANNER_PROVIDER_JSON_SCHEMA,
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
