import {
  AiGatewayError,
  PlannerRequestSchema,
  detectWorkflowIntent,
  type PlannerResult,
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
import { selectPlanningGoogleConnections } from '@/lib/google-planning-connections';
import { reserveAssistantUsage, type AssistantUsageReservation } from '@/lib/usage-control-server';
import {
  selectAutomaticFolderAliasId,
  selectTrustedFolderAliasIds,
  selectWorkflowPlanningContext,
} from '@/lib/workflow-planning-context';

const MAX_REQUEST_BYTES = 20_000;
const ApiPlannerRequestSchema = PlannerRequestSchema.extend({
  attachmentIds: z.array(z.string().uuid()).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
  conversationId: z.string().uuid().optional(),
  provider: AiModelSelectionSchema.shape.provider.default('auto'),
  tier: AiModelSelectionSchema.shape.tier.default('auto'),
}).strict();

const RETRYABLE_AUTO_PROVIDER_CODES = new Set([
  'AI_OUTPUT_INVALID',
  'AI_PROVIDER_AUTHENTICATION_FAILED',
  'AI_PROVIDER_NOT_CONFIGURED',
  'AI_PROVIDER_QUOTA_EXCEEDED',
  'AI_PROVIDER_RATE_LIMITED',
  'AI_PROVIDER_REQUEST_FAILED',
  'AI_PROVIDER_RESPONSE_INVALID',
  'AI_PROVIDER_TIMEOUT',
]);

function canRetryAutoProvider(error: unknown): error is AiGatewayError {
  return error instanceof AiGatewayError && RETRYABLE_AUTO_PROVIDER_CODES.has(error.code);
}

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
    validatedPlannerRequest.context.executionTarget,
  );
  const intent = detectWorkflowIntent(validatedPlannerRequest.prompt);
  const needsAppsScript = intent.requiredNodeTypes.includes('apps_script.deploy_template');
  const googleConnections = await listGoogleConnections().catch(() => []);
  const googlePlanningConnections = selectPlanningGoogleConnections(
    googleConnections,
    needsAppsScript,
  );
  const googleConnectionIds = googlePlanningConnections.connectionIds;
  const requiresGoogleReauthorization = googlePlanningConnections.requiresReauthorization;
  const trustedExecutionTarget = intent.needsDesktop
    ? serverPlanningContext.executionTarget
    : ({ type: 'cloud' } as const);
  const explicitlySelectedFolderAliasIds = selectTrustedFolderAliasIds(
    serverPlanningContext.allowedFolderAliasIds,
    validatedPlannerRequest.context.allowedFolderAliasIds,
  );
  const automaticFolderAliasId = selectAutomaticFolderAliasId(
    serverPlanningContext.selectedTarget,
    validatedPlannerRequest.prompt,
  );
  const trustedFolderAliasIds =
    explicitlySelectedFolderAliasIds.length > 0
      ? explicitlySelectedFolderAliasIds
      : automaticFolderAliasId === undefined
        ? []
        : [automaticFolderAliasId];
  if (intent.needsGoogleConnection && googleConnectionIds.length === 0) {
    return Response.json(
      {
        error: {
          code: requiresGoogleReauthorization
            ? 'AI_GOOGLE_REAUTHORIZATION_REQUIRED'
            : 'AI_GOOGLE_CONNECTION_REQUIRED',
          message: requiresGoogleReauthorization
            ? 'Create a new upgraded Google Workspace connection, then create a fresh plan. Existing reviewed runs remain bound to the legacy connection and cannot be retried as upgraded.'
            : 'Connect an approved Google Workspace account before planning this workflow.',
        },
      },
      { headers: { 'cache-control': 'no-store' }, status: 409 },
    );
  }
  if (intent.needsDesktop && trustedExecutionTarget.type !== 'desktop') {
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
  if (intent.needsDesktop && trustedFolderAliasIds.length === 0) {
    return Response.json(
      {
        error: {
          code: 'AI_DESKTOP_REQUIRED',
          message: 'Select an approved local folder before planning this workflow.',
        },
      },
      { headers: { 'cache-control': 'no-store' }, status: 409 },
    );
  }
  const trustedPlannerRequest = {
    ...validatedPlannerRequest,
    context: {
      ...validatedPlannerRequest.context,
      allowedFolderAliasIds: trustedFolderAliasIds,
      executionTarget: trustedExecutionTarget,
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
    const attemptedProviders = new Set<ResolvedAiModelRoute['provider']>();
    let result: PlannerResult | undefined;
    while (result === undefined) {
      const activeRoute = route;
      usageReservation = await reserveAssistantUsage(workspace, {
        inputCharacters: boundedPrompt.length,
        maxAttempts: trustedPlannerRequest.maxRepairAttempts + 1,
        maxOutputTokens: 4_096,
        operation: 'workflow_plan',
        provider: activeRoute.provider,
        costMultiplier: activeRoute.costMultiplier,
      });
      try {
        result = await createServerAiGateway(
          activeRoute.provider,
          createAssistantUsageSink(workspace, conversation.id, usageReservation),
          {
            model: activeRoute.model,
            ...(activeRoute.reasoningEffort === undefined
              ? {}
              : { reasoningEffort: activeRoute.reasoningEffort }),
          },
        ).plan(
          {
            ...trustedPlannerRequest,
            prompt: boundedPrompt,
          },
          request.signal,
        );
      } catch (error) {
        await usageReservation.release().catch(() => undefined);
        usageReservation = undefined;
        if (providerSelection !== 'auto' || !canRetryAutoProvider(error)) throw error;
        attemptedProviders.add(activeRoute.provider);
        console.warn(
          JSON.stringify({
            aiPlanProviderFallback: {
              code: error.code,
              provider: activeRoute.provider,
            },
          }),
        );
        route = await resolveAiModelRoute(workspace, {
          excludedProviders: [...attemptedProviders],
          operation: 'workflow_plan',
          provider: 'auto',
          tier,
        });
      }
    }
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
