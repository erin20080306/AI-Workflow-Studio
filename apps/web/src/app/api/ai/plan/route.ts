import {
  AiGatewayError,
  AiProviderNameSchema,
  PlannerRequestSchema,
} from '@ai-workflow-studio/ai-gateway';
import { z } from 'zod';

import {
  appendAssistantMessage,
  createAssistantUsageSink,
  ensureAssistantConversation,
} from '@/lib/assistant-conversation-server';
import type { AssistantConversationSummary } from '@/lib/assistant-conversation-schema';
import {
  getWorkspaceContext,
  mockWorkspaceContext,
  type WorkspaceContext,
} from '@/lib/auth/context';
import { createServerAiGateway } from '@/lib/ai-gateway';
import { plannerAccessDecision } from '@/lib/control-plane-access';
import { getEnvironment } from '@/lib/env';

const MAX_REQUEST_BYTES = 20_000;
const ApiPlannerRequestSchema = PlannerRequestSchema.extend({
  conversationId: z.string().uuid().optional(),
  provider: AiProviderNameSchema.default('mock'),
}).strict();

const statusByCode = {
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
  const { conversationId, ...validatedPlannerRequest } = plannerRequest;
  const environment = getEnvironment();
  let workspace: WorkspaceContext | null = environment.mockMode ? mockWorkspaceContext() : null;
  if (!environment.mockMode) {
    try {
      workspace = await getWorkspaceContext();
    } catch {
      workspace = null;
    }
  }
  const access = plannerAccessDecision(environment.mockMode, provider, workspace !== null);
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

  if (workspace === null) {
    return Response.json(
      {
        error: {
          code: 'AI_AUTH_REQUIRED',
          message: 'An authenticated workspace is required.',
        },
      },
      { headers: { 'cache-control': 'no-store' }, status: 401 },
    );
  }

  let conversation: AssistantConversationSummary | undefined;
  try {
    const model = environment.providerModels[provider];
    conversation = await ensureAssistantConversation(workspace, {
      ...(conversationId === undefined ? {} : { conversationId }),
      mode: 'plan',
      model,
      provider,
      title: validatedPlannerRequest.prompt,
    });
    const userMessage = await appendAssistantMessage(workspace, {
      body: validatedPlannerRequest.prompt,
      conversationId: conversation.id,
      role: 'user',
    });
    const result = await createServerAiGateway(
      provider,
      createAssistantUsageSink(workspace, conversation.id),
    ).plan(validatedPlannerRequest, request.signal);
    const assistantMessage = await appendAssistantMessage(workspace, {
      body: result.output.explanation,
      conversationId: conversation.id,
      inputUnits: result.usage.inputTokens,
      model: result.model,
      outputUnits: result.usage.outputTokens,
      plan: result.output,
      provider: result.provider,
      role: 'assistant',
    });
    return Response.json(
      {
        assistantMessage,
        attempts: result.attempts,
        conversationId: conversation.id,
        model: result.model,
        output: result.output,
        provider: result.provider,
        usage: result.usage,
        userMessage,
      },
      {
        headers: {
          'cache-control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (conversation !== undefined) {
      try {
        await appendAssistantMessage(workspace, {
          body: 'The validated planning response could not be completed.',
          conversationId: conversation.id,
          model: environment.providerModels[provider],
          provider,
          role: 'assistant',
          status:
            error instanceof AiGatewayError && error.code === 'AI_PROVIDER_CANCELLED'
              ? 'cancelled'
              : 'failed',
        });
      } catch {
        // Preserve the original provider or persistence error.
      }
    }
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
