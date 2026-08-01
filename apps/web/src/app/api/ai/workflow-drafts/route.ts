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
    console.error(
      JSON.stringify({
        assistantWorkflowDraftRequestFailure: {
          code:
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            typeof error.code === 'string'
              ? error.code
              : 'RUN_STATE_CONFLICT',
        },
      }),
    );
    return runApiError(error);
  }
}

export const runtime = 'nodejs';
