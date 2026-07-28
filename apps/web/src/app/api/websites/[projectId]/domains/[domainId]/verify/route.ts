import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { verifyWebsiteCustomDomain } from '@/lib/website-custom-domain-server';
import { websiteApiError } from '@/lib/website-studio-api';

const ParamsSchema = z
  .object({
    domainId: z.string().uuid(),
    projectId: z.string().uuid(),
  })
  .strict();

export async function POST(
  _request: Request,
  routeContext: {
    readonly params: Promise<{
      readonly domainId: string;
      readonly projectId: string;
    }>;
  },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    return Response.json(
      {
        domain: await verifyWebsiteCustomDomain(context, params.projectId, params.domainId),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
