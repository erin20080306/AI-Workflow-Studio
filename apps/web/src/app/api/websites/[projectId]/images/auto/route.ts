import { WebsiteStorefrontImagesInputSchema } from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { readWebsiteJson, websiteApiError } from '@/lib/website-studio-api';
import { autoGenerateStorefrontImages, websiteSpecClientView } from '@/lib/website-spec-server';

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();

export async function POST(
  request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    const input = WebsiteStorefrontImagesInputSchema.parse(await readWebsiteJson(request));
    const result = await autoGenerateStorefrontImages(
      context,
      params.projectId,
      input,
      request.signal,
    );
    return Response.json(
      {
        generated: result.generated,
        generation:
          result.generation === undefined ? undefined : websiteSpecClientView(result.generation),
      },
      { headers: { 'cache-control': 'no-store' }, status: 201 },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const maxDuration = 300;
export const runtime = 'nodejs';
