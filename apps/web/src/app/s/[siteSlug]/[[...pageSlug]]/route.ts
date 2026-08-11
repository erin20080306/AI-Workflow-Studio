import { z } from 'zod';

import { WEBSITE_PUBLIC_HEADERS } from '@/lib/website-preview-contract';
import {
  applyInventorySold,
  renderWebsitePublishedDocument,
} from '@/lib/website-preview-renderer';
import {
  renderWebsiteAccessDeniedDocument,
  websiteAccessHeaders,
} from '@/lib/website-access-documents';
import { getWebsitePageAccessState } from '@/lib/website-access-server';
import { getWebsiteInventorySold, listPublishedWebsiteContent } from '@/lib/website-admin-server';
import { listPublishedWebsiteDataForms } from '@/lib/website-data-server';
import { getPublishedWebsiteBySlug } from '@/lib/website-publication-server';
import { WEBSITE_SITE_HOST_HEADER } from '@/lib/website-site-host';

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
  request: Request,
  routeContext: {
    readonly params: Promise<{
      readonly pageSlug?: readonly string[];
      readonly siteSlug: string;
    }>;
  },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const routeMode =
      request.headers.get(WEBSITE_SITE_HOST_HEADER) === params.siteSlug
        ? 'site-host'
        : 'platform-path';
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
    const access = await getWebsitePageAccessState(website, pageSlug);
    const authHref = `/api/public-sites/${website.publication.slug}/auth?pageSlug=${encodeURIComponent(
      pageSlug,
    )}`;
    if (!access.allowed && access.requiredRole !== null) {
      return new Response(
        renderWebsiteAccessDeniedDocument({
          authHref,
          backHref:
            routeMode === 'site-host'
              ? `/${website.spec.pages[0]?.slug ?? ''}`
              : `/s/${website.publication.slug}/${website.spec.pages[0]?.slug ?? ''}`,
          hasIdentity: access.identity !== undefined,
          locale: website.spec.locale,
          requiredRole: access.requiredRole,
        }),
        {
          headers: websiteAccessHeaders(),
          status: access.identity === undefined ? 401 : 403,
        },
      );
    }
    const [managedContent, dataForms, inventorySold] = await Promise.all([
      listPublishedWebsiteContent(website, pageSlug),
      listPublishedWebsiteDataForms(website, pageSlug),
      getWebsiteInventorySold(website),
    ]);
    return new Response(
      renderWebsitePublishedDocument(
        applyInventorySold(website.spec, inventorySold),
        pageSlug,
        website.publication.slug,
        assetUrls,
        routeMode,
        managedContent,
        {
          href: authHref,
          label:
            access.member?.displayName ??
            (website.spec.locale === 'zh-Hant' ? '會員登入' : 'Member sign in'),
        },
        dataForms,
      ),
      {
        headers: {
          ...WEBSITE_PUBLIC_HEADERS,
          'cache-control': 'private, no-store, max-age=0',
          vary: 'cookie',
        },
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
