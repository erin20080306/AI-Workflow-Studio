import { describe, expect, it } from 'vitest';

import type { FetchTransport, ProviderCompletionRequest } from '../types';
import { AnthropicAdapter } from './anthropic';
import { GeminiAdapter } from './gemini';
import { OpenAiAdapter } from './openai';

const DEVICE_ID = '00000000-0000-4000-8000-000000000611';
const FOLDER_ID = '00000000-0000-4000-8000-000000000612';
const API_KEY = 'test-api-key-not-a-real-secret';

const completionRequest: ProviderCompletionRequest = {
  attempt: 1,
  plannerRequest: {
    context: {
      allowedFolderAliasIds: [FOLDER_ID],
      executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
      locale: 'zh-Hant',
      timezone: 'Asia/Taipei',
    },
    maxRepairAttempts: 1,
    prompt: '建立一份安全且不覆寫來源檔案的 Excel 訂單彙整工作流。',
  },
  systemPrompt: 'Return JSON.',
  userPrompt: 'Plan the workflow.',
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

describe('provider adapters', () => {
  it('uses the OpenAI Responses API with server authorization and JSON output mode', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchTransport: FetchTransport = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return jsonResponse({
        id: 'resp_test',
        model: 'gpt-5.6-sol',
        output: [
          {
            content: [{ text: '{"ok":true}', type: 'output_text' }],
            type: 'message',
          },
        ],
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          total_tokens: 18,
        },
      });
    };

    const completion = await new OpenAiAdapter({
      apiKey: API_KEY,
      fetchTransport,
    }).complete(completionRequest);
    const body = JSON.parse(String(capturedInit?.body)) as {
      readonly store: boolean;
      readonly text: { readonly format: { readonly type: string } };
    };

    expect(capturedUrl).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(capturedInit?.headers).get('authorization')).toBe(`Bearer ${API_KEY}`);
    expect(body).toMatchObject({
      store: false,
      text: { format: { type: 'json_object' } },
    });
    expect(String(capturedInit?.body)).not.toContain(API_KEY);
    expect(completion).toMatchObject({
      model: 'gpt-5.6-sol',
      text: '{"ok":true}',
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
    });
  });

  it('uses Anthropic Messages structured output without embedding the key in the body', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchTransport: FetchTransport = async (_input, init) => {
      capturedInit = init;
      return jsonResponse({
        content: [{ text: '{"ok":true}', type: 'text' }],
        id: 'msg_test',
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        usage: { input_tokens: 9, output_tokens: 6 },
      });
    };

    const completion = await new AnthropicAdapter({
      apiKey: API_KEY,
      fetchTransport,
    }).complete(completionRequest);
    const body = JSON.parse(String(capturedInit?.body)) as {
      readonly output_config: { readonly format: { readonly type: string } };
    };

    expect(new Headers(capturedInit?.headers).get('x-api-key')).toBe(API_KEY);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(String(capturedInit?.body)).not.toContain(API_KEY);
    expect(completion.usage.totalTokens).toBe(15);
  });

  it('uses Gemini JSON response configuration with the key in a header', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchTransport: FetchTransport = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: '{"ok":true}' }] },
            finishReason: 'STOP',
          },
        ],
        modelVersion: 'gemini-3.6-flash',
        responseId: 'gemini_test',
        usageMetadata: {
          candidatesTokenCount: 5,
          promptTokenCount: 8,
          totalTokenCount: 13,
        },
      });
    };

    const completion = await new GeminiAdapter({
      apiKey: API_KEY,
      fetchTransport,
    }).complete(completionRequest);
    const body = JSON.parse(String(capturedInit?.body)) as {
      readonly generationConfig: { readonly responseMimeType: string };
    };

    expect(capturedUrl).toContain('/v1beta/models/gemini-3.6-flash:generateContent');
    expect(capturedUrl).not.toContain(API_KEY);
    expect(new Headers(capturedInit?.headers).get('x-goog-api-key')).toBe(API_KEY);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(completion.usage.totalTokens).toBe(13);
  });

  it('rejects a truncated Gemini structured response', async () => {
    const fetchTransport: FetchTransport = async () =>
      jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: '{"workflow":' }] },
            finishReason: 'MAX_TOKENS',
          },
        ],
      });

    await expect(
      new GeminiAdapter({
        apiKey: API_KEY,
        fetchTransport,
      }).complete(completionRequest),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_RESPONSE_INVALID',
      message: 'Gemini did not return a usable planner output.',
    });
  });

  it('maps provider authentication failures without exposing the key or response body', async () => {
    const fetchTransport: FetchTransport = async () =>
      jsonResponse({ error: { message: `bad key ${API_KEY}` } }, 401);

    const error = await new OpenAiAdapter({
      apiKey: API_KEY,
      fetchTransport,
    })
      .complete(completionRequest)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'AI_PROVIDER_AUTHENTICATION_FAILED',
      message: 'AI provider authentication failed.',
    });
    expect(JSON.stringify(error)).not.toContain(API_KEY);
  });
});
