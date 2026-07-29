import { WebsiteSiteAuthInputSchema } from '@ai-workflow-studio/website-schema';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { renderWebsiteAuthDocument, websiteAccessHeaders } from '@/lib/website-access-documents';
import {
  executeWebsiteSiteAuth,
  getWebsiteSiteAuthState,
  WEBSITE_SITE_SESSION_COOKIE,
} from '@/lib/website-access-server';
import { getEnvironment } from '@/lib/env';
import { getPublishedWebsiteBySlug } from '@/lib/website-publication-server';
import { websiteSiteSlugFromHost } from '@/lib/website-site-host';
import { WebsiteStudioError } from '@/lib/website-studio-server';

const ParamsSchema = z
  .object({
    siteSlug: z
      .string()
      .min(3)
      .max(96)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

const PageSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const RequestHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.-]+(?::[0-9]{1,5})?$/);

function pageSlugForWebsite(
  website: NonNullable<Awaited<ReturnType<typeof getPublishedWebsiteBySlug>>>,
  value: unknown,
): string {
  const parsed = PageSlugSchema.safeParse(value);
  if (parsed.success && website.spec.pages.some((page) => page.slug === parsed.data)) {
    return parsed.data;
  }
  const fallback = website.spec.pages[0]?.slug;
  if (fallback === undefined) throw new Error('Published website has no pages.');
  return fallback;
}

function sitePageHref(request: Request, siteSlug: string, pageSlug: string): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  return websiteSiteSlugFromHost(host) === siteSlug ? `/${pageSlug}` : `/s/${siteSlug}/${pageSlug}`;
}

function requestOrigin(request: NextRequest): string {
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = z
    .enum(['http', 'https'])
    .parse(forwardedProtocol ?? request.nextUrl.protocol.replace(':', ''));
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = RequestHostSchema.parse(forwardedHost ?? request.headers.get('host'));
  return new URL(`${protocol}://${host}`).origin;
}

function authPage(
  request: NextRequest,
  website: NonNullable<Awaited<ReturnType<typeof getPublishedWebsiteBySlug>>>,
  input: {
    readonly backHref: string;
    readonly message?: string;
    readonly pageSlug: string;
  },
  state: Awaited<ReturnType<typeof getWebsiteSiteAuthState>>,
  status = 200,
): Response {
  const origin = requestOrigin(request);
  return new Response(
    renderWebsiteAuthDocument({
      authAction: `${origin}/api/public-sites/${website.publication.slug}/auth`,
      backHref: input.backHref,
      locale: website.spec.locale,
      ...(state.member === undefined ? {} : { member: state.member }),
      ...(input.message === undefined ? {} : { message: input.message }),
      pageSlug: input.pageSlug,
      registrationEnabled: state.registrationEnabled,
      siteName: website.spec.name,
    }),
    { headers: websiteAccessHeaders(origin), status },
  );
}

export async function GET(
  request: NextRequest,
  routeContext: { readonly params: Promise<{ readonly siteSlug: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const website = await getPublishedWebsiteBySlug(params.siteSlug);
    if (website === undefined) return new Response('Website not found.', { status: 404 });
    const pageSlug = pageSlugForWebsite(website, request.nextUrl.searchParams.get('pageSlug'));
    const status = request.nextUrl.searchParams.get('status');
    const message =
      status === 'confirmed'
        ? website.spec.locale === 'zh-Hant'
          ? '電子郵件已完成驗證，你現在可以使用網站會員帳戶。'
          : 'Email confirmed. Your site member account is ready.'
        : status === 'confirmation-failed'
          ? website.spec.locale === 'zh-Hant'
            ? '驗證連結無效或已過期，請重新註冊或登入。'
            : 'The verification link is invalid or expired. Register or sign in again.'
          : undefined;
    return authPage(
      request,
      website,
      {
        backHref: sitePageHref(request, params.siteSlug, pageSlug),
        ...(message === undefined ? {} : { message }),
        pageSlug,
      },
      await getWebsiteSiteAuthState(website),
    );
  } catch {
    return new Response('Website not found.', { status: 404 });
  }
}

export async function POST(
  request: NextRequest,
  routeContext: { readonly params: Promise<{ readonly siteSlug: string }> },
): Promise<Response> {
  let website: Awaited<ReturnType<typeof getPublishedWebsiteBySlug>>;
  let pageSlug = 'home';
  let backHref = '/';
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    if (request.headers.get('origin') !== requestOrigin(request)) {
      throw new WebsiteStudioError('WEBSITE_INVALID', 'The authentication origin is invalid.');
    }
    const contentLengthHeader = request.headers.get('content-length');
    const contentLength = Number(contentLengthHeader);
    if (
      contentLengthHeader === null ||
      !Number.isSafeInteger(contentLength) ||
      contentLength < 1 ||
      contentLength > 16_000
    ) {
      throw new WebsiteStudioError('WEBSITE_INVALID', 'The authentication request is invalid.');
    }
    const form = await request.formData();
    if (form.get('website') !== null && form.get('website') !== '') {
      throw new WebsiteStudioError('WEBSITE_INVALID', 'The authentication request is invalid.');
    }
    website = await getPublishedWebsiteBySlug(params.siteSlug);
    if (website === undefined) return new Response('Website not found.', { status: 404 });
    pageSlug = pageSlugForWebsite(website, form.get('pageSlug'));
    backHref = sitePageHref(request, params.siteSlug, pageSlug);
    const input = WebsiteSiteAuthInputSchema.parse({
      action: form.get('action'),
      ...(form.get('action') === 'register'
        ? {
            confirmPassword: form.get('confirmPassword'),
            displayName: form.get('displayName'),
            email: form.get('email'),
            password: form.get('password'),
          }
        : form.get('action') === 'login'
          ? {
              email: form.get('email'),
              password: form.get('password'),
            }
          : {}),
      pageSlug,
    });
    const result = await executeWebsiteSiteAuth(website, input);
    if (result.kind === 'check-email') {
      const state = await getWebsiteSiteAuthState(website);
      return authPage(
        request,
        website,
        {
          backHref,
          message:
            website.spec.locale === 'zh-Hant'
              ? '註冊資料已收到，請開啟驗證郵件完成帳戶確認。'
              : 'Registration received. Open the verification email to confirm your account.',
          pageSlug,
        },
        state,
        202,
      );
    }
    const response = NextResponse.redirect(new URL(backHref, requestOrigin(request)), 303);
    if (getEnvironment().mockMode) {
      if (result.kind === 'authenticated' && result.mockSessionToken !== undefined) {
        response.cookies.set(WEBSITE_SITE_SESSION_COOKIE, result.mockSessionToken, {
          httpOnly: true,
          maxAge: 60 * 60 * 12,
          sameSite: 'lax',
          secure: request.nextUrl.protocol === 'https:',
        });
      } else if (result.kind === 'signed-out') {
        response.cookies.set(WEBSITE_SITE_SESSION_COOKIE, '', {
          httpOnly: true,
          maxAge: 0,
          sameSite: 'lax',
          secure: request.nextUrl.protocol === 'https:',
        });
      }
    }
    return response;
  } catch (error) {
    if (website === undefined) return new Response('Website not found.', { status: 404 });
    const limited = error instanceof WebsiteStudioError && error.code === 'WEBSITE_RATE_LIMITED';
    const forbidden = error instanceof WebsiteStudioError && error.code === 'WEBSITE_FORBIDDEN';
    const state = await getWebsiteSiteAuthState(website).catch(() => ({
      registrationEnabled: false,
    }));
    return authPage(
      request,
      website,
      {
        backHref,
        message:
          website.spec.locale === 'zh-Hant'
            ? limited
              ? '嘗試次數過多，請稍後再試。'
              : forbidden
                ? '電子郵件、密碼或會員狀態無法通過驗證。'
                : '無法完成此操作，請檢查欄位後再試。'
            : limited
              ? 'Too many attempts. Try again later.'
              : forbidden
                ? 'The email, password, or membership status could not be verified.'
                : 'The request could not be completed. Check the fields and try again.',
        pageSlug,
      },
      state,
      limited ? 429 : 400,
    );
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
