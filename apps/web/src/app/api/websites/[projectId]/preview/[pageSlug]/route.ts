import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { WEBSITE_PREVIEW_HEADERS } from '@/lib/website-preview-contract';
import { renderWebsitePreviewDocument } from '@/lib/website-preview-renderer';
import { getWebsiteSpecGeneration } from '@/lib/website-spec-server';

const ParamsSchema = z
  .object({
    pageSlug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    projectId: z.string().uuid(),
  })
  .strict();

async function previewResponse(
  _request: Request,
  routeContext: {
    readonly params: Promise<{ readonly pageSlug: string; readonly projectId: string }>;
  },
  includeBody: boolean,
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    const generation = await getWebsiteSpecGeneration(context, params.projectId);
    if (generation === undefined) {
      return new Response('Preview not found.', {
        headers: WEBSITE_PREVIEW_HEADERS,
        status: 404,
      });
    }
    const pageExists = generation.spec.pages.some((page) => page.slug === params.pageSlug);
    if (!pageExists) {
      return new Response('Preview not found.', {
        headers: WEBSITE_PREVIEW_HEADERS,
        status: 404,
      });
    }
    return new Response(
      includeBody ? renderWebsitePreviewDocument(generation.spec, params.pageSlug) : null,
      {
        headers: WEBSITE_PREVIEW_HEADERS,
        status: 200,
      },
    );
  } catch {
    return new Response('Preview not found.', {
      headers: WEBSITE_PREVIEW_HEADERS,
      status: 404,
    });
  }
}

export async function GET(
  request: Request,
  routeContext: {
    readonly params: Promise<{ readonly pageSlug: string; readonly projectId: string }>;
  },
): Promise<Response> {
  return previewResponse(request, routeContext, true);
}

export async function HEAD(
  request: Request,
  routeContext: {
    readonly params: Promise<{ readonly pageSlug: string; readonly projectId: string }>;
  },
): Promise<Response> {
  return previewResponse(request, routeContext, false);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
