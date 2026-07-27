import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { websiteApiError } from '@/lib/website-studio-api';
import { createWebsiteDraft } from '@/lib/website-studio-server';

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();

export async function POST(
  _request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    return Response.json(
      { project: await createWebsiteDraft(context, params.projectId) },
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
