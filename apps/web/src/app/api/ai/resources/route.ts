import { z } from 'zod';

import { assistantApiError } from '@/lib/assistant-api';
import { listAssistantResources } from '@/lib/assistant-resource-server';
import { requireWorkspaceContext } from '@/lib/auth/context';

const QuerySchema = z.object({ conversationId: z.string().uuid() }).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const input = QuerySchema.parse({
      conversationId: url.searchParams.get('conversationId'),
    });
    const context = await requireWorkspaceContext();
    return Response.json(await listAssistantResources(context, input.conversationId), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return assistantApiError(error);
  }
}

export const runtime = 'nodejs';
