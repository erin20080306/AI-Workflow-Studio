import { z } from 'zod';

import { WEBSITE_PUBLIC_HEADERS } from '@/lib/website-preview-contract';
import { renderWebsitePublishedDocument } from '@/lib/website-preview-renderer';
import { getPublishedWebsiteBySlug } from '@/lib/website-publication-server';

const ParamsSchema = z
  .object({
    pageSlug: z.array(z.string()).max(1).optional(),
    siteSlug: z
      .string()
      .min(3)
      .max(96)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

export async function GET(
  _request: Request,
  routeContext: {
    readonly params: Promise<{
      readonly pageSlug?: readonly string[];
      readonly siteSlug: string;
    }>;
  },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const website = await getPublishedWebsiteBySlug(params.siteSlug);
    if (website === undefined) {
      return new Response('Website not found.', { headers: WEBSITE_PUBLIC_HEADERS, status: 404 });
    }
    const pageSlug = params.pageSlug?.[0] ?? website.spec.pages[0]?.slug;
    if (
      pageSlug === undefined ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(pageSlug) ||
      !website.spec.pages.some((page) => page.slug === pageSlug)
    ) {
      return new Response('Page not found.', { headers: WEBSITE_PUBLIC_HEADERS, status: 404 });
    }
    const assetUrls = new Map(
      website.spec.assets
        .filter((asset) => asset.kind === 'project-asset')
        .map((asset) => [
          asset.id,
          `/api/public-sites/${website.publication.slug}/assets/${asset.id}`,
        ]),
    );
    return new Response(
      renderWebsitePublishedDocument(website.spec, pageSlug, website.publication.slug, assetUrls),
      {
        headers: WEBSITE_PUBLIC_HEADERS,
        status: 200,
      },
    );
  } catch {
    return new Response('Website not found.', {
      headers: WEBSITE_PUBLIC_HEADERS,
      status: 404,
    });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
