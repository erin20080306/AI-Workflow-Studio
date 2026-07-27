import { WebsiteBriefPatchSchema } from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { readWebsiteJson, websiteApiError } from '@/lib/website-studio-api';
import { getWebsiteProject, updateWebsiteBrief } from '@/lib/website-studio-server';

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();

export async function GET(
  _request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    return Response.json(
      { project: await getWebsiteProject(context, params.projectId) },
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
    const patch = WebsiteBriefPatchSchema.parse(await readWebsiteJson(request));
    return Response.json(
      { project: await updateWebsiteBrief(context, params.projectId, patch) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
