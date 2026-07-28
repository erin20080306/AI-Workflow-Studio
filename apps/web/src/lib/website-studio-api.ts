import 'server-only';

import { AiGatewayError } from '@ai-workflow-studio/ai-gateway';

import { UsageControlError, type UsageControlErrorCode } from '@/lib/usage-control-server';
import { WebsiteStudioError } from '@/lib/website-studio-server';
import { z } from 'zod';

const statusByCode: Readonly<Record<WebsiteStudioError['code'], number>> = {
  WEBSITE_FORBIDDEN: 403,
  WEBSITE_INVALID: 400,
  WEBSITE_NOT_FOUND: 404,
  WEBSITE_PROVIDER_UNAVAILABLE: 503,
  WEBSITE_STATE_CONFLICT: 409,
};

const statusByAiCode: Readonly<Record<AiGatewayError['code'], number>> = {
  AI_OUTPUT_INVALID: 422,
  AI_PROVIDER_AUTHENTICATION_FAILED: 502,
  AI_PROVIDER_CANCELLED: 499,
  AI_PROVIDER_NOT_CONFIGURED: 503,
  AI_PROVIDER_QUOTA_EXCEEDED: 402,
  AI_PROVIDER_RATE_LIMITED: 429,
  AI_PROVIDER_REQUEST_FAILED: 502,
  AI_PROVIDER_RESPONSE_INVALID: 502,
  AI_PROVIDER_TIMEOUT: 504,
  AI_REQUEST_INVALID: 400,
  AI_USAGE_LOG_FAILED: 503,
};

const statusByUsageCode: Readonly<Record<UsageControlErrorCode, number>> = {
  USAGE_ALLOWANCE_EXCEEDED: 429,
  USAGE_BUDGET_EXCEEDED: 402,
  USAGE_DATA_INVALID: 503,
  USAGE_RATE_LIMIT_EXCEEDED: 429,
  USAGE_REQUEST_COST_EXCEEDED: 402,
};

export async function readWebsiteJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > 32_000) {
    throw new WebsiteStudioError('WEBSITE_INVALID', 'The website request is too large.');
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 32_000) {
    throw new WebsiteStudioError('WEBSITE_INVALID', 'The website request is too large.');
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new WebsiteStudioError('WEBSITE_INVALID', 'The website request must contain JSON.');
  }
}

export function websiteApiError(error: unknown): Response {
  if (error instanceof AiGatewayError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      {
        headers: { 'cache-control': 'no-store' },
        status: statusByAiCode[error.code],
      },
    );
  }
  if (error instanceof UsageControlError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      {
        headers: { 'cache-control': 'no-store' },
        status: statusByUsageCode[error.code],
      },
    );
  }
  const safe =
    error instanceof WebsiteStudioError
      ? error
      : error instanceof z.ZodError
        ? new WebsiteStudioError('WEBSITE_INVALID', 'The website request is invalid.')
        : new WebsiteStudioError(
            'WEBSITE_STATE_CONFLICT',
            'The website request could not be completed.',
          );
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    {
      headers: { 'cache-control': 'no-store' },
      status: statusByCode[safe.code],
    },
  );
}
