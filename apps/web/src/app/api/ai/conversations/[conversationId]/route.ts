import { z } from 'zod';

import { assistantApiError } from '@/lib/assistant-api';
import { getAssistantConversation } from '@/lib/assistant-conversation-server';
import { requireWorkspaceContext } from '@/lib/auth/context';

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

export const runtime = 'nodejs';
