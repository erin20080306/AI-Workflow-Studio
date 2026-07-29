import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import {
  hasSupabasePublicConfiguration,
  parseSupabasePublicConfiguration,
} from './lib/supabase/config';
import {
  isPublishedWebsiteApiPath,
  WEBSITE_SITE_HOST_HEADER,
  websiteSiteRewritePath,
  websiteSiteSlugFromHost,
} from './lib/website-site-host';

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const siteSlug = websiteSiteSlugFromHost(host);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(WEBSITE_SITE_HOST_HEADER);
  if (siteSlug !== undefined) {
    if (isPublishedWebsiteApiPath(request.nextUrl.pathname, siteSlug)) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    requestHeaders.set(WEBSITE_SITE_HOST_HEADER, siteSlug);
    const destination = request.nextUrl.clone();
    destination.pathname = websiteSiteRewritePath(siteSlug, request.nextUrl.pathname);
    return NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
  }
  if (
    process.env.NEXT_PUBLIC_MOCK_MODE !== 'false' ||
    !hasSupabasePublicConfiguration(process.env)
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const configuration = parseSupabasePublicConfiguration(process.env);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(configuration.url, configuration.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, options, value }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
