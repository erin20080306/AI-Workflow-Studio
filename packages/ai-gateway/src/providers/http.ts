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
      throw new AiGatewayError('AI_PROVIDER_REQUEST_FAILED', 'AI provider request was cancelled.', {
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
