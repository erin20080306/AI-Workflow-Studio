import { WebsiteSpecGenerationInputSchema } from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { readWebsiteJson, websiteApiError } from '@/lib/website-studio-api';
import { generateWebsiteSpec, websiteSpecClientView } from '@/lib/website-spec-server';

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();

export async function POST(
  request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    const input = WebsiteSpecGenerationInputSchema.parse(await readWebsiteJson(request));
    const generation = await generateWebsiteSpec(context, params.projectId, input, request.signal);
    return Response.json(
      { generation: websiteSpecClientView(generation) },
      {
        headers: { 'cache-control': 'no-store' },
        status: 201,
      },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
