import { assistantApiError } from '@/lib/assistant-api';
import { listAssistantConversations } from '@/lib/assistant-conversation-server';
import { requireWorkspaceContext } from '@/lib/auth/context';

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

export const runtime = 'nodejs';
