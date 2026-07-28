import { WebsiteSiteSlugAvailabilitySchema } from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { getWebsiteSiteSlugAvailability } from '@/lib/website-publication-server';
import { websiteApiError } from '@/lib/website-studio-api';

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();
const QuerySchema = z.object({ name: z.string().min(1).max(160) }).strict();

export async function GET(
  request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const query = QuerySchema.parse({
      name: new URL(request.url).searchParams.get('name'),
    });
    const context = await requireWorkspaceContext();
    const availability = WebsiteSiteSlugAvailabilitySchema.parse(
      await getWebsiteSiteSlugAvailability(context, params.projectId, query.name),
    );
    return Response.json(availability, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
