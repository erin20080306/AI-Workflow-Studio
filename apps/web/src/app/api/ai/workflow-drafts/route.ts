import { readRunJson, runApiError } from '@/lib/run-api';
import { AssistantWorkflowDraftCreateRequestSchema } from '@/lib/assistant-execution-schema';
import { createAssistantWorkflowDraft } from '@/lib/assistant-execution-server';
import { requireWorkspaceContext } from '@/lib/auth/context';

export async function POST(request: Request): Promise<Response> {
  try {
    const input = AssistantWorkflowDraftCreateRequestSchema.parse(await readRunJson(request));
    const context = await requireWorkspaceContext();
    return Response.json(
      { draft: await createAssistantWorkflowDraft(context, input) },
      { headers: { 'cache-control': 'no-store' }, status: 201 },
    );
  } catch (error) {
    return runApiError(error);
  }
}

export const runtime = 'nodejs';
