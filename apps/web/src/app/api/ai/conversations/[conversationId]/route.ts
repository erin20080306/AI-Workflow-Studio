import { z } from 'zod';

import { assistantApiError } from '@/lib/assistant-api';
import {
  deleteAssistantConversation,
  getAssistantConversation,
} from '@/lib/assistant-conversation-server';
import { deleteMemoryAssistantResources } from '@/lib/assistant-resource-server';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';

const ParamsSchema = z.object({ conversationId: z.string().uuid() }).strict();

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly conversationId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await context.params);
    const workspace = await requireWorkspaceContext();
    return Response.json(
      { conversation: await getAssistantConversation(workspace, params.conversationId) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return assistantApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { readonly params: Promise<{ readonly conversationId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await context.params);
    const workspace = await requireWorkspaceContext();
    if (getEnvironment().mockMode) {
      deleteMemoryAssistantResources(workspace.actor.tenantId, params.conversationId);
    }
    await deleteAssistantConversation(workspace, params.conversationId);
    return new Response(null, {
      headers: { 'cache-control': 'no-store' },
      status: 204,
    });
  } catch (error) {
    return assistantApiError(error);
  }
}

export const runtime = 'nodejs';
