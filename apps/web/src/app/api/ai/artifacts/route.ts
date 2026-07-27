import { assistantApiError, readAssistantJson } from '@/lib/assistant-api';
import { AssistantArtifactCreateRequestSchema } from '@/lib/assistant-resource-schema';
import { createAssistantArtifact } from '@/lib/assistant-resource-server';
import { requireWorkspaceContext } from '@/lib/auth/context';

export async function POST(request: Request): Promise<Response> {
  try {
    const input = AssistantArtifactCreateRequestSchema.parse(await readAssistantJson(request));
    const context = await requireWorkspaceContext();
    return Response.json(
      { artifact: await createAssistantArtifact(context, input) },
      { headers: { 'cache-control': 'no-store' }, status: 201 },
    );
  } catch (error) {
    return assistantApiError(error);
  }
}

export const runtime = 'nodejs';
