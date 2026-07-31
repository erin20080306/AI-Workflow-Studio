import {
  AiGatewayError,
  PlannerRequestSchema,
  detectWorkflowIntent,
} from '@ai-workflow-studio/ai-gateway';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  renderPreparedSources,
} from '@ai-workflow-studio/tool-registry';
import { AIPlannerOutputSchema } from '@ai-workflow-studio/workflow-schema';
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
import { listAssistantExecutionTargets } from '@/lib/assistant-execution-targets';
import { plannerAccessDecision } from '@/lib/control-plane-access';
import { getEnvironment } from '@/lib/env';
import { listGoogleConnections } from '@/lib/google-connections';
import { reserveAssistantUsage, type AssistantUsageReservation } from '@/lib/usage-control-server';
import { selectWorkflowPlanningContext } from '@/lib/workflow-planning-context';

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

  const serverPlanningContext = selectWorkflowPlanningContext(
    await listAssistantExecutionTargets(workspace),
  );
  const googleConnectionIds = await listGoogleConnections()
    .then((connections) => connections.map((connection) => connection.id))
    .catch(() => [] as readonly string[]);
  const intent = detectWorkflowIntent(validatedPlannerRequest.prompt);
  if (intent.needsGoogleConnection && googleConnectionIds.length === 0) {
    return Response.json(
      {
        error: {
          code: 'AI_GOOGLE_CONNECTION_REQUIRED',
          message: 'Connect an approved Google Workspace account before planning this workflow.',
        },
      },
      { headers: { 'cache-control': 'no-store' }, status: 409 },
    );
  }
  if (intent.needsDesktop && serverPlanningContext.executionTarget.type !== 'desktop') {
    return Response.json(
      {
        error: {
          code: 'AI_DESKTOP_REQUIRED',
          message:
            'Pair an online Desktop Agent and approve a folder before planning this workflow.',
        },
      },
      { headers: { 'cache-control': 'no-store' }, status: 409 },
    );
  }
  const trustedPlannerRequest = {
    ...validatedPlannerRequest,
    context: {
      ...validatedPlannerRequest.context,
      allowedFolderAliasIds: serverPlanningContext.allowedFolderAliasIds,
      executionTarget: serverPlanningContext.executionTarget,
      googleConnectionIds,
    },
  };

  let conversation: AssistantConversationSummary | undefined;
  let usageReservation: AssistantUsageReservation | undefined;
  try {
    const model = route.model;
    conversation = await ensureAssistantConversation(workspace, {
      ...(conversationId === undefined ? {} : { conversationId }),
      mode: 'plan',
      model,
      provider: route.provider,
      title: trustedPlannerRequest.prompt,
    });
    const userMessage = await appendAssistantMessage(workspace, {
      body: trustedPlannerRequest.prompt,
      conversationId: conversation.id,
      role: 'user',
    });
    const sources = await prepareAssistantSources(workspace, {
      attachmentIds,
      conversationId: conversation.id,
      maxCharacters: 4_000,
      messageId: userMessage.id,
    });
    const boundedPrompt = renderPreparedSources(trustedPlannerRequest.prompt, sources, 8_000);
    usageReservation = await reserveAssistantUsage(workspace, {
      inputCharacters: boundedPrompt.length,
      maxAttempts: trustedPlannerRequest.maxRepairAttempts + 1,
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
        ...trustedPlannerRequest,
        prompt: boundedPrompt,
      },
      request.signal,
    );
    const routedOutput = AIPlannerOutputSchema.parse({
      ...result.output,
      workflow: {
        ...result.output.workflow,
        nodes: result.output.workflow.nodes.map((node) =>
          node.type === 'ai.summarize'
            ? {
                ...node,
                config: {
                  ...node.config,
                  provider: providerSelection,
                  tier,
                },
              }
            : node,
        ),
      },
    });
    const assistantMessage = await appendAssistantMessage(workspace, {
      body: routedOutput.explanation,
      conversationId: conversation.id,
      inputUnits: result.usage.inputTokens,
      model: result.model,
      outputUnits: result.usage.outputTokens,
      plan: routedOutput,
      provider: result.provider,
      role: 'assistant',
    });
    return Response.json(
      {
        assistantMessage,
        attempts: result.attempts,
        conversationId: conversation.id,
        model: result.model,
        output: routedOutput,
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
    const providerDetails =
      error instanceof AiGatewayError
        ? {
            ...(Array.isArray(error.details.validationCodes)
              ? {
                  validationCodes: error.details.validationCodes.filter(
                    (code): code is string => typeof code === 'string',
                  ),
                }
              : {}),
            ...(typeof error.details.providerCode === 'number' ||
            typeof error.details.providerCode === 'string'
              ? { providerCode: error.details.providerCode }
              : {}),
            ...(typeof error.details.providerType === 'string'
              ? { providerType: error.details.providerType }
              : {}),
          }
        : {};
    console.error(
      JSON.stringify({
        aiPlanFailure: {
          code: safe.code,
          model: route.model,
          provider: route.provider,
          reason: error instanceof Error ? error.message : safe.message,
          ...providerDetails,
        },
      }),
    );
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
