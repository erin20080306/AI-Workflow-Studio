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

function sseResponse(events: readonly unknown[]): Response {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function collectChat(
  adapter: OpenAiAdapter | AnthropicAdapter | GeminiAdapter,
): Promise<readonly unknown[]> {
  const events: unknown[] = [];
  for await (const event of adapter.streamChat({
    chatRequest: {
      locale: 'zh-Hant',
      maxOutputTokens: 512,
      messages: [{ content: '請說明安全自動化的做法。', role: 'user' }],
    },
    messages: [{ content: '請說明安全自動化的做法。', role: 'user' }],
    systemPrompt: 'Do not execute tools.',
  })) {
    events.push(event);
  }
  return events;
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

  it('normalizes OpenAI typed SSE chat events', async () => {
    const events = await collectChat(
      new OpenAiAdapter({
        apiKey: API_KEY,
        fetchTransport: async () =>
          sseResponse([
            { type: 'response.created' },
            { delta: '安全', type: 'response.output_text.delta' },
            {
              response: {
                id: 'resp_stream',
                model: 'gpt-5.6-sol',
                usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
              },
              type: 'response.completed',
            },
          ]),
      }),
    );

    expect(events).toEqual([
      { text: '安全', type: 'delta' },
      {
        model: 'gpt-5.6-sol',
        requestId: 'resp_stream',
        type: 'done',
        usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      },
    ]);
  });

  it('normalizes Anthropic content deltas and cumulative usage', async () => {
    const events = await collectChat(
      new AnthropicAdapter({
        apiKey: API_KEY,
        fetchTransport: async () =>
          sseResponse([
            {
              message: {
                id: 'msg_stream',
                model: 'claude-sonnet-4-6',
                usage: { input_tokens: 5, output_tokens: 1 },
              },
              type: 'message_start',
            },
            {
              delta: { text: '可審核', type: 'text_delta' },
              type: 'content_block_delta',
            },
            {
              delta: { stop_reason: 'end_turn' },
              type: 'message_delta',
              usage: { output_tokens: 3 },
            },
            { type: 'message_stop' },
          ]),
      }),
    );

    expect(events.at(-1)).toMatchObject({
      requestId: 'msg_stream',
      type: 'done',
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
    });
  });

  it('normalizes Gemini streamed content chunks', async () => {
    const events = await collectChat(
      new GeminiAdapter({
        apiKey: API_KEY,
        fetchTransport: async () =>
          sseResponse([
            {
              candidates: [{ content: { parts: [{ text: '先驗證' }] }, index: 0 }],
              modelVersion: 'gemini-3.6-flash',
              responseId: 'gemini_stream',
              usageMetadata: { promptTokenCount: 4 },
            },
            {
              candidates: [
                {
                  content: { parts: [{ text: '再執行' }] },
                  finishReason: 'STOP',
                  index: 0,
                },
              ],
              modelVersion: 'gemini-3.6-flash',
              responseId: 'gemini_stream',
              usageMetadata: {
                candidatesTokenCount: 2,
                promptTokenCount: 4,
                totalTokenCount: 6,
              },
            },
          ]),
      }),
    );

    expect(events).toMatchObject([
      { text: '先驗證', type: 'delta' },
      { text: '再執行', type: 'delta' },
      {
        requestId: 'gemini_stream',
        type: 'done',
        usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      },
    ]);
  });

  it('maps caller cancellation to a secret-safe provider error', async () => {
    const controller = new AbortController();
    let signalStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const adapter = new OpenAiAdapter({
      apiKey: API_KEY,
      fetchTransport: async (_input, init): Promise<Response> => {
        signalStarted?.();
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelled', 'AbortError')),
            { once: true },
          );
        });
      },
    });
    const stream = adapter.streamChat({
      chatRequest: {
        locale: 'zh-Hant',
        maxOutputTokens: 512,
        messages: [{ content: '停止回應', role: 'user' }],
      },
      messages: [{ content: '停止回應', role: 'user' }],
      signal: controller.signal,
      systemPrompt: 'Do not execute tools.',
    });
    const iterator = stream[Symbol.asyncIterator]();
    const pending = iterator.next();

    await started;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'AI_PROVIDER_CANCELLED' });
  });
});
