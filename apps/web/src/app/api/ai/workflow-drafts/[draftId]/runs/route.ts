import { z } from 'zod';

import { startAssistantWorkflowDraftRun } from '@/lib/assistant-execution-server';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { runApiError } from '@/lib/run-api';

const ParamsSchema = z.object({ draftId: z.string().uuid() }).strict();

export async function POST(
  _request: Request,
  context: { readonly params: Promise<{ readonly draftId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await context.params);
    const workspace = await requireWorkspaceContext();
    return Response.json(await startAssistantWorkflowDraftRun(workspace, params.draftId), {
      headers: { 'cache-control': 'no-store' },
      status: 201,
    });
  } catch (error) {
    return runApiError(error);
  }
}

export const runtime = 'nodejs';
export const maxDuration = 800;
