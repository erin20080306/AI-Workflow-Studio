import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { WebsiteIntegrationPlanInputSchema } from '@/lib/website-integration-guidance';
import {
  listWebsiteIntegrationPlans,
  saveWebsiteIntegrationPlan,
} from '@/lib/website-integration-server';
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
      { plans: await listWebsiteIntegrationPlans(context, params.projectId) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export async function PUT(
  request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    const input = WebsiteIntegrationPlanInputSchema.parse(await readWebsiteJson(request));
    return Response.json(
      { plan: await saveWebsiteIntegrationPlan(context, params.projectId, input) },
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
