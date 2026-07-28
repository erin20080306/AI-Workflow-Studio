import { z } from 'zod';

import { assistantApiError } from '@/lib/assistant-api';
import { getAssistantImage } from '@/lib/assistant-image-server';
import { requireWorkspaceContext } from '@/lib/auth/context';

const ParamsSchema = z.object({ imageId: z.string().uuid() }).strict();

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly imageId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await context.params);
    const workspace = await requireWorkspaceContext();
    const image = await getAssistantImage(workspace, params.imageId);
    return new Response(Buffer.from(image.bytes), {
      headers: {
        'cache-control': 'private, no-store',
        'content-type': image.mimeType,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return assistantApiError(error);
  }
}

export const runtime = 'nodejs';
