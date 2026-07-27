import {
  WebsiteImageGenerationInputSchema,
  WebsiteGeneratedAssetSchema,
} from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { readWebsiteJson, websiteApiError } from '@/lib/website-studio-api';
import { generateWebsiteAsset, websiteSpecClientView } from '@/lib/website-spec-server';

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();

export async function POST(
  request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    const input = WebsiteImageGenerationInputSchema.parse(await readWebsiteJson(request));
    const result = await generateWebsiteAsset(context, params.projectId, input, request.signal);
    return Response.json(
      {
        asset: WebsiteGeneratedAssetSchema.parse(result.asset),
        generation: websiteSpecClientView(result.generation),
      },
      {
        headers: { 'cache-control': 'no-store' },
        status: 201,
      },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const maxDuration = 60;
export const runtime = 'nodejs';
