import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { WebsiteGithubPushInputSchema } from '@/lib/website-github-schema';
import { publishWebsiteVersionToGithub } from '@/lib/website-github-server';
import { readWebsiteJson, websiteApiError } from '@/lib/website-studio-api';

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();

export async function POST(
  request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    const input = WebsiteGithubPushInputSchema.parse(await readWebsiteJson(request));
    return Response.json(
      { publication: await publishWebsiteVersionToGithub(context, params.projectId, input) },
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
