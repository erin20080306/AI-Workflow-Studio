import { assistantApiError, readAssistantJson } from '@/lib/assistant-api';
import {
  ensureAssistantConversation,
  listAssistantConversations,
} from '@/lib/assistant-conversation-server';
import { AssistantConversationCreateRequestSchema } from '@/lib/assistant-resource-schema';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { resolveAiModelRoute } from '@/lib/ai-model-routing';
import { plannerAccessDecision } from '@/lib/control-plane-access';
import { getEnvironment } from '@/lib/env';

export async function GET(): Promise<Response> {
  try {
    const context = await requireWorkspaceContext();
    return Response.json(
      { conversations: await listAssistantConversations(context) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return assistantApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const input = AssistantConversationCreateRequestSchema.parse(await readAssistantJson(request));
    const context = await requireWorkspaceContext();
    const environment = getEnvironment();
    const route = await resolveAiModelRoute(context, {
      operation: input.mode === 'ask' ? 'chat' : 'workflow_plan',
      provider: input.provider,
      tier: input.tier,
    });
    const access = plannerAccessDecision(environment.mockMode, route.provider, true);
    if (!access.allowed) {
      return Response.json(
        { error: { code: access.code, message: access.message } },
        { headers: { 'cache-control': 'no-store' }, status: access.status },
      );
    }
    const conversation = await ensureAssistantConversation(context, {
      mode: input.mode,
      model: route.model,
      provider: route.provider,
      title: input.title,
    });
    return Response.json(
      { conversation },
      { headers: { 'cache-control': 'no-store' }, status: 201 },
    );
  } catch (error) {
    return assistantApiError(error);
  }
}

export const runtime = 'nodejs';
