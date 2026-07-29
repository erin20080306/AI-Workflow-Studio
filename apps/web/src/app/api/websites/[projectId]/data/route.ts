import { WebsiteDataMutationSchema } from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { getWebsiteDataDashboard, mutateWebsiteData } from '@/lib/website-data-server';
import { readWebsiteJson, websiteApiError } from '@/lib/website-studio-api';

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();

export async function GET(
  _request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    return Response.json(
      { dashboard: await getWebsiteDataDashboard(context, params.projectId) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export async function PATCH(
  request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    const mutation = WebsiteDataMutationSchema.parse(await readWebsiteJson(request));
    return Response.json(
      { dashboard: await mutateWebsiteData(context, params.projectId, mutation) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
