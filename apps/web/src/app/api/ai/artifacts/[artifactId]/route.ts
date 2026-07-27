import { z } from 'zod';

import { assistantApiError } from '@/lib/assistant-api';
import { getAssistantArtifactDownload } from '@/lib/assistant-resource-server';
import { requireWorkspaceContext } from '@/lib/auth/context';

const ParamsSchema = z.object({ artifactId: z.string().uuid() }).strict();

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly artifactId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await context.params);
    const workspace = await requireWorkspaceContext();
    const file = await getAssistantArtifactDownload(workspace, params.artifactId);
    return new Response(file.content, {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': `attachment; filename="assistant-artifact.md"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'content-type': `${file.mimeType}; charset=utf-8`,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return assistantApiError(error);
  }
}

export const runtime = 'nodejs';
