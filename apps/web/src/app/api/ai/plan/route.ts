import {
  AiGatewayError,
  AiProviderNameSchema,
  PlannerRequestSchema,
} from '@ai-workflow-studio/ai-gateway';

import { createServerAiGateway } from '@/lib/ai-gateway';
import { plannerAccessDecision } from '@/lib/control-plane-access';
import { getEnvironment } from '@/lib/env';

const MAX_REQUEST_BYTES = 20_000;
const ApiPlannerRequestSchema = PlannerRequestSchema.extend({
  provider: AiProviderNameSchema.default('mock'),
}).strict();

const statusByCode = {
  AI_OUTPUT_INVALID: 422,
  AI_PROVIDER_AUTHENTICATION_FAILED: 502,
  AI_PROVIDER_NOT_CONFIGURED: 503,
  AI_PROVIDER_RATE_LIMITED: 429,
  AI_PROVIDER_REQUEST_FAILED: 502,
  AI_PROVIDER_RESPONSE_INVALID: 502,
  AI_PROVIDER_TIMEOUT: 504,
  AI_REQUEST_INVALID: 400,
  AI_USAGE_LOG_FAILED: 503,
} as const;

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { error: { code: 'AI_REQUEST_INVALID', message: 'Planning request is too large.' } },
      { status: 413 },
    );
  }

  let input: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
      return Response.json(
        { error: { code: 'AI_REQUEST_INVALID', message: 'Planning request is too large.' } },
        { status: 413 },
      );
    }
    input = JSON.parse(body) as unknown;
  } catch {
    return Response.json(
      { error: { code: 'AI_REQUEST_INVALID', message: 'Planning request must be valid JSON.' } },
      { status: 400 },
    );
  }

  const parsed = ApiPlannerRequestSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: 'AI_REQUEST_INVALID',
          message: 'Planning request failed validation.',
          paths: parsed.error.issues.map((issue) => issue.path.map(String).join('.')),
        },
      },
      { status: 400 },
    );
  }

  const { provider, ...plannerRequest } = parsed.data;
  const access = plannerAccessDecision(getEnvironment().mockMode, provider);
  if (!access.allowed) {
    return Response.json(
      {
        error: {
          code: access.code,
          message: access.message,
        },
      },
      {
        headers: {
          'cache-control': 'no-store',
        },
        status: access.status,
      },
    );
  }

  try {
    const result = await createServerAiGateway(provider).plan(plannerRequest, request.signal);
    return Response.json(
      {
        attempts: result.attempts,
        model: result.model,
        output: result.output,
        provider: result.provider,
        usage: result.usage,
      },
      {
        headers: {
          'cache-control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (error instanceof AiGatewayError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: statusByCode[error.code] },
      );
    }
    return Response.json(
      {
        error: {
          code: 'AI_PROVIDER_REQUEST_FAILED',
          message: 'AI planning could not be completed.',
        },
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
