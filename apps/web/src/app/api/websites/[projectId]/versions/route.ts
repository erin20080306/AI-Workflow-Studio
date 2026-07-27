import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { listWebsiteSpecGenerations, websiteSpecClientView } from '@/lib/website-spec-server';
import { websiteApiError } from '@/lib/website-studio-api';

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();

export async function GET(
  _request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    const generations = await listWebsiteSpecGenerations(context, params.projectId);
    return Response.json(
      { versions: generations.map(websiteSpecClientView) },
      { headers: { 'cache-control': 'no-store' }, status: 200 },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
