import 'server-only';

import { AiGatewayError } from '@ai-workflow-studio/ai-gateway';
import { z } from 'zod';

import {
  AssistantPersistenceError,
  type AssistantPersistenceErrorCode,
} from '@/lib/assistant-conversation-server';
import {
  AssistantResourceError,
  type AssistantResourceErrorCode,
} from '@/lib/assistant-resource-server';
import { AuthenticationError, type AuthenticationErrorCode } from '@/lib/auth/context';
import { UsageControlError, type UsageControlErrorCode } from '@/lib/usage-control-server';

const MAX_REQUEST_BYTES = 20_000;

const statusByAiCode = {
  AI_OUTPUT_INVALID: 422,
  AI_PROVIDER_AUTHENTICATION_FAILED: 502,
  AI_PROVIDER_CANCELLED: 499,
  AI_PROVIDER_NOT_CONFIGURED: 503,
  AI_PROVIDER_RATE_LIMITED: 429,
  AI_PROVIDER_REQUEST_FAILED: 502,
  AI_PROVIDER_RESPONSE_INVALID: 502,
  AI_PROVIDER_TIMEOUT: 504,
  AI_REQUEST_INVALID: 400,
  AI_USAGE_LOG_FAILED: 503,
} as const;

const statusByAuthCode: Readonly<Record<AuthenticationErrorCode, number>> = {
  AUTHENTICATION_REQUIRED: 401,
  AUTH_CONFIGURATION_ERROR: 503,
  AUTH_DATA_INVALID: 500,
  AUTH_WORKSPACE_REQUIRED: 403,
};

const statusByPersistenceCode: Readonly<Record<AssistantPersistenceErrorCode, number>> = {
  ASSISTANT_CONVERSATION_NOT_FOUND: 404,
  ASSISTANT_PERSISTENCE_FAILED: 503,
};

const statusByResourceCode: Readonly<Record<AssistantResourceErrorCode, number>> = {
  ASSISTANT_RESOURCE_FAILED: 503,
  ASSISTANT_RESOURCE_INVALID: 400,
  ASSISTANT_RESOURCE_LIMIT_EXCEEDED: 413,
  ASSISTANT_RESOURCE_NOT_FOUND: 404,
};
const statusByUsageCode: Readonly<Record<UsageControlErrorCode, number>> = {
  USAGE_ALLOWANCE_EXCEEDED: 429,
  USAGE_BUDGET_EXCEEDED: 402,
  USAGE_DATA_INVALID: 503,
  USAGE_RATE_LIMIT_EXCEEDED: 429,
  USAGE_REQUEST_COST_EXCEEDED: 402,
};

export async function readAssistantJson(
  request: Request,
  maxRequestBytes = MAX_REQUEST_BYTES,
): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(contentLength) || contentLength > maxRequestBytes) {
    throw new AiGatewayError('AI_REQUEST_INVALID', 'The AI request is too large.');
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxRequestBytes) {
    throw new AiGatewayError('AI_REQUEST_INVALID', 'The AI request is too large.');
  }
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new AiGatewayError('AI_REQUEST_INVALID', 'The AI request must contain JSON.', {
      cause: error,
    });
  }
}

export function assistantErrorDetails(error: unknown): {
  readonly code: string;
  readonly message: string;
  readonly status: number;
} {
  if (error instanceof AiGatewayError) {
    return {
      code: error.code,
      message: error.message,
      status: statusByAiCode[error.code],
    };
  }
  if (error instanceof AuthenticationError) {
    return {
      code: error.code,
      message: error.message,
      status: statusByAuthCode[error.code],
    };
  }
  if (error instanceof AssistantPersistenceError) {
    return {
      code: error.code,
      message: error.message,
      status: statusByPersistenceCode[error.code],
    };
  }
  if (error instanceof AssistantResourceError) {
    return {
      code: error.code,
      message: error.message,
      status: statusByResourceCode[error.code],
    };
  }
  if (error instanceof UsageControlError) {
    return {
      code: error.code,
      message: error.message,
      status: statusByUsageCode[error.code],
    };
  }
  if (error instanceof z.ZodError) {
    return {
      code: 'AI_REQUEST_INVALID',
      message: 'The AI request failed validation.',
      status: 400,
    };
  }
  return {
    code: 'AI_PROVIDER_REQUEST_FAILED',
    message: 'The AI request could not be completed.',
    status: 500,
  };
}

export function assistantApiError(error: unknown): Response {
  const safe = assistantErrorDetails(error);
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    {
      headers: { 'cache-control': 'no-store' },
      status: safe.status,
    },
  );
}
