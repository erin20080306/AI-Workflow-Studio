import { AiGatewayError, PlannerRequestSchema } from '@ai-workflow-studio/ai-gateway';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  renderPreparedSources,
} from '@ai-workflow-studio/tool-registry';
import { z } from 'zod';

import { assistantErrorDetails } from '@/lib/assistant-api';
import { resolveAiModelRoute, type ResolvedAiModelRoute } from '@/lib/ai-model-routing';
import { AiModelSelectionSchema } from '@/lib/ai-model-selection';
import {
  appendAssistantMessage,
  createAssistantUsageSink,
  ensureAssistantConversation,
} from '@/lib/assistant-conversation-server';
import type { AssistantConversationSummary } from '@/lib/assistant-conversation-schema';
import { prepareAssistantSources } from '@/lib/assistant-resource-server';
import {
  getWorkspaceContext,
  mockWorkspaceContext,
  type WorkspaceContext,
} from '@/lib/auth/context';
import { createServerAiGateway } from '@/lib/ai-gateway';
import { plannerAccessDecision } from '@/lib/control-plane-access';
import { getEnvironment } from '@/lib/env';
import { reserveAssistantUsage, type AssistantUsageReservation } from '@/lib/usage-control-server';

const MAX_REQUEST_BYTES = 20_000;
const ApiPlannerRequestSchema = PlannerRequestSchema.extend({
  attachmentIds: z.array(z.string().uuid()).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
  conversationId: z.string().uuid().optional(),
  provider: AiModelSelectionSchema.shape.provider.default('auto'),
  tier: AiModelSelectionSchema.shape.tier.default('auto'),
}).strict();

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

  const { attachmentIds, provider: providerSelection, tier, ...plannerRequest } = parsed.data;
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
  let route: ResolvedAiModelRoute | undefined;
  if (workspace !== null) {
    try {
      route = await resolveAiModelRoute(workspace, {
        operation: 'workflow_plan',
        provider: providerSelection,
        tier,
      });
    } catch (error) {
      const safe = assistantErrorDetails(error);
      return Response.json(
        { error: { code: safe.code, message: safe.message } },
        { headers: { 'cache-control': 'no-store' }, status: safe.status },
      );
    }
  }
  const access = plannerAccessDecision(
    environment.mockMode,
    route?.provider ?? 'mock',
    workspace !== null,
  );
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

  if (workspace === null || route === undefined) {
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
  let usageReservation: AssistantUsageReservation | undefined;
  try {
    const model = route.model;
    conversation = await ensureAssistantConversation(workspace, {
      ...(conversationId === undefined ? {} : { conversationId }),
      mode: 'plan',
      model,
      provider: route.provider,
      title: validatedPlannerRequest.prompt,
    });
    const userMessage = await appendAssistantMessage(workspace, {
      body: validatedPlannerRequest.prompt,
      conversationId: conversation.id,
      role: 'user',
    });
    const sources = await prepareAssistantSources(workspace, {
      attachmentIds,
      conversationId: conversation.id,
      maxCharacters: 4_000,
      messageId: userMessage.id,
    });
    const boundedPrompt = renderPreparedSources(validatedPlannerRequest.prompt, sources, 8_000);
    usageReservation = await reserveAssistantUsage(workspace, {
      inputCharacters: boundedPrompt.length,
      maxAttempts: validatedPlannerRequest.maxRepairAttempts + 1,
      maxOutputTokens: 4_096,
      operation: 'workflow_plan',
      provider: route.provider,
      costMultiplier: route.costMultiplier,
    });
    const result = await createServerAiGateway(
      route.provider,
      createAssistantUsageSink(workspace, conversation.id, usageReservation),
      {
        model: route.model,
        ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
      },
    ).plan(
      {
        ...validatedPlannerRequest,
        prompt: boundedPrompt,
      },
      request.signal,
    );
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
          model: route.model,
          provider: route.provider,
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
    const safe = assistantErrorDetails(error);
    return Response.json(
      {
        error: {
          code: safe.code,
          message: safe.message,
        },
      },
      { headers: { 'cache-control': 'no-store' }, status: safe.status },
    );
  } finally {
    try {
      await usageReservation?.release();
    } catch {
      // Reservations expire automatically; never replace the primary response.
    }
  }
}

export const runtime = 'nodejs';
