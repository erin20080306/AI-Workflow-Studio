import { WebsiteSpecRestoreInputSchema } from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { restoreWebsiteSpec, websiteSpecClientView } from '@/lib/website-spec-server';
import { readWebsiteJson, websiteApiError } from '@/lib/website-studio-api';

const ParamsSchema = z
  .object({
    projectId: z.string().uuid(),
    versionNumber: z.coerce.number().int().min(1),
  })
  .strict();

export async function POST(
  request: Request,
  routeContext: {
    readonly params: Promise<{
      readonly projectId: string;
      readonly versionNumber: string;
    }>;
  },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    const input = WebsiteSpecRestoreInputSchema.parse(await readWebsiteJson(request));
    const generation = await restoreWebsiteSpec(
      context,
      params.projectId,
      params.versionNumber,
      input,
    );
    return Response.json(
      { generation: websiteSpecClientView(generation) },
      { headers: { 'cache-control': 'no-store' }, status: 201 },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
