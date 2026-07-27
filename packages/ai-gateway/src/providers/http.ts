import { AiGatewayError } from '../errors';
import type { FetchTransport } from '../types';

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_RESPONSE_BYTES = 1_000_000;

interface PostJsonOptions {
  readonly body: unknown;
  readonly fetchTransport?: FetchTransport;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly url: string;
}

function httpError(status: number): AiGatewayError {
  if (status === 401 || status === 403) {
    return new AiGatewayError(
      'AI_PROVIDER_AUTHENTICATION_FAILED',
      'AI provider authentication failed.',
    );
  }
  if (status === 429) {
    return new AiGatewayError('AI_PROVIDER_RATE_LIMITED', 'AI provider rate limit exceeded.', {
      retryable: true,
    });
  }
  return new AiGatewayError('AI_PROVIDER_REQUEST_FAILED', 'AI provider request failed.', {
    details: { status },
    retryable: status >= 500,
  });
}

interface StreamJsonOptions extends PostJsonOptions {
  readonly timeoutMs?: number;
}

function parseSseData(block: string): string | undefined {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  return data.length === 0 ? undefined : data;
}

export async function* streamJsonEvents(options: StreamJsonOptions): AsyncIterable<unknown> {
  const fetchTransport = options.fetchTransport ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort('provider_timeout'),
    options.timeoutMs ?? 90_000,
  );
  const abortListener = () => controller.abort('caller_aborted');
  options.signal?.addEventListener('abort', abortListener, { once: true });
  if (options.signal?.aborted === true) {
    controller.abort('caller_aborted');
  }

  try {
    const response = await fetchTransport(options.url, {
      body: JSON.stringify(options.body),
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        ...options.headers,
      },
      method: 'POST',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw httpError(response.status);
    }
    if (response.body === null) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'AI provider returned no response stream.',
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedBytes = 0;

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        buffer += decoder.decode();
      } else {
        receivedBytes += chunk.value.byteLength;
        if (receivedBytes > MAX_RESPONSE_BYTES) {
          throw new AiGatewayError(
            'AI_PROVIDER_RESPONSE_INVALID',
            'AI provider response exceeded the maximum accepted size.',
          );
        }
        buffer += decoder.decode(chunk.value, { stream: true });
      }

      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      if (chunk.done && buffer.trim().length > 0) {
        blocks.push(buffer);
        buffer = '';
      }

      for (const block of blocks) {
        const data = parseSseData(block);
        if (data === undefined || data === '[DONE]') {
          continue;
        }
        try {
          yield JSON.parse(data) as unknown;
        } catch (error) {
          throw new AiGatewayError(
            'AI_PROVIDER_RESPONSE_INVALID',
            'AI provider returned an invalid streaming event.',
            { cause: error },
          );
        }
      }

      if (chunk.done) {
        break;
      }
    }
  } catch (error) {
    if (error instanceof AiGatewayError) {
      throw error;
    }
    if (controller.signal.aborted) {
      if (controller.signal.reason === 'provider_timeout') {
        throw new AiGatewayError('AI_PROVIDER_TIMEOUT', 'AI provider request timed out.', {
          cause: error,
          retryable: true,
        });
      }
      throw new AiGatewayError('AI_PROVIDER_CANCELLED', 'AI provider request was cancelled.', {
        cause: error,
      });
    }
    throw new AiGatewayError('AI_PROVIDER_REQUEST_FAILED', 'AI provider request failed.', {
      cause: error,
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortListener);
  }
}

export async function postJson(options: PostJsonOptions): Promise<unknown> {
  const fetchTransport = options.fetchTransport ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort('provider_timeout'),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const abortListener = () => controller.abort('caller_aborted');
  options.signal?.addEventListener('abort', abortListener, { once: true });
  if (options.signal?.aborted === true) {
    controller.abort('caller_aborted');
  }

  try {
    const response = await fetchTransport(options.url, {
      body: JSON.stringify(options.body),
      headers: {
        'content-type': 'application/json',
        ...options.headers,
      },
      method: 'POST',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw httpError(response.status);
    }
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'AI provider response exceeded the maximum accepted size.',
      );
    }

    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'AI provider response exceeded the maximum accepted size.',
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new AiGatewayError(
        'AI_PROVIDER_RESPONSE_INVALID',
        'AI provider returned an invalid response envelope.',
        { cause: error },
      );
    }
  } catch (error) {
    if (error instanceof AiGatewayError) {
      throw error;
    }
    if (controller.signal.aborted) {
      if (controller.signal.reason === 'provider_timeout') {
        throw new AiGatewayError('AI_PROVIDER_TIMEOUT', 'AI provider request timed out.', {
          cause: error,
          retryable: true,
        });
      }
      throw new AiGatewayError('AI_PROVIDER_CANCELLED', 'AI provider request was cancelled.', {
        cause: error,
      });
    }
    throw new AiGatewayError('AI_PROVIDER_REQUEST_FAILED', 'AI provider request failed.', {
      cause: error,
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortListener);
  }
}
