import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getEnvironment } from '@/lib/env';
import { ensureCurrentWebsiteSiteMember } from '@/lib/website-access-server';
import { getPublishedWebsiteBySlug } from '@/lib/website-publication-server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ParamsSchema = z
  .object({
    siteSlug: z
      .string()
      .min(3)
      .max(96)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

const OtpTypeSchema = z.enum(['email', 'magiclink', 'signup']);

export async function GET(
  request: NextRequest,
  routeContext: { readonly params: Promise<{ readonly siteSlug: string }> },
): Promise<NextResponse> {
  const params = ParamsSchema.safeParse(await routeContext.params);
  if (!params.success) return NextResponse.redirect(new URL('/', request.url));
  const website = await getPublishedWebsiteBySlug(params.data.siteSlug);
  if (website === undefined) return NextResponse.redirect(new URL('/', request.url));
  const requestedPage = request.nextUrl.searchParams.get('pageSlug');
  const pageSlug =
    website.spec.pages.find((page) => page.slug === requestedPage)?.slug ??
    website.spec.pages[0]?.slug;
  if (pageSlug === undefined) return NextResponse.redirect(new URL('/', request.url));

  let verified = getEnvironment().mockMode;
  if (!verified) {
    const tokenHash = request.nextUrl.searchParams.get('token_hash');
    const type = OtpTypeSchema.safeParse(request.nextUrl.searchParams.get('type'));
    const code = request.nextUrl.searchParams.get('code');
    const supabase = await createSupabaseServerClient();
    if (tokenHash !== null && type.success) {
      const result = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type.data as EmailOtpType,
      });
      verified = result.error === null;
    } else if (code !== null && code.length >= 8 && code.length <= 4_000) {
      const result = await supabase.auth.exchangeCodeForSession(code);
      verified = result.error === null;
    }
  }

  if (verified && !getEnvironment().mockMode) {
    try {
      await ensureCurrentWebsiteSiteMember(website);
    } catch {
      verified = false;
    }
  }

  const destination = new URL(`/api/public-sites/${params.data.siteSlug}/auth`, request.url);
  destination.searchParams.set('pageSlug', pageSlug);
  destination.searchParams.set('status', verified ? 'confirmed' : 'confirmation-failed');
  return NextResponse.redirect(destination);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
