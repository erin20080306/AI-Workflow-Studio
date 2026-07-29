import { WebsitePublicDataSubmissionSchema } from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { submitPublishedWebsiteDataForm } from '@/lib/website-data-server';
import { getPublishedWebsiteBySlug } from '@/lib/website-publication-server';
import { websiteSiteSlugFromHost } from '@/lib/website-site-host';
import { WebsiteStudioError } from '@/lib/website-studio-server';

const FormKeySchema = z
  .string()
  .min(2)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);

const SiteSlugSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const ParamsSchema = z
  .object({
    formKey: FormKeySchema,
    siteSlug: SiteSlugSchema,
  })
  .strict();

const RESPONSE_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src 'none'",
    "script-src 'none'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'content-type': 'text/html; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function responseDocument(
  title: string,
  message: string,
  backHref: string,
  status: number,
): Response {
  return new Response(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta content="noindex,nofollow,noarchive" name="robots"><meta content="width=device-width,initial-scale=1" name="viewport"><title>${escapeHtml(
      title,
    )}</title><style>:root{font-family:Inter,system-ui,sans-serif;color:#0f172a;background:#f8fafc}*{box-sizing:border-box}body{display:grid;min-height:100vh;margin:0;place-items:center;padding:24px}.card{width:min(560px,100%);border:1px solid #dbe3ee;border-radius:28px;background:#fff;padding:36px;box-shadow:0 24px 60px #0f172a14}h1{font-size:30px;margin:0}p{color:#5b6b82;line-height:1.7}.button{display:inline-block;margin-top:16px;border-radius:999px;background:#4f46e5;color:#fff;font-weight:800;padding:12px 20px;text-decoration:none}</style></head><body><main class="card"><h1>${escapeHtml(
      title,
    )}</h1><p>${escapeHtml(message)}</p><a class="button" href="${escapeHtml(
      backHref,
    )}">返回網站</a></main></body></html>`,
    { headers: RESPONSE_HEADERS, status },
  );
}

function requestOrigin(request: Request): string | undefined {
  const protocol =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
    new URL(request.url).protocol.replace(':', '');
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ??
    request.headers.get('host') ??
    new URL(request.url).host;
  if (
    !['http', 'https'].includes(protocol) ||
    !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:]+\])(?::\d{1,5})?$/iu.test(host)
  ) {
    return undefined;
  }
  return `${protocol}://${host}`;
}

export async function POST(
  request: Request,
  routeContext: {
    readonly params: Promise<{ readonly formKey: string; readonly siteSlug: string }>;
  },
): Promise<Response> {
  let backHref = '/';
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const origin = requestOrigin(request);
    if (origin === undefined || request.headers.get('origin') !== origin) {
      throw new WebsiteStudioError('WEBSITE_FORBIDDEN', 'Cross-origin form submission denied.');
    }
    const contentLengthHeader = request.headers.get('content-length');
    const contentLength = Number(contentLengthHeader);
    if (
      contentLengthHeader === null ||
      !Number.isSafeInteger(contentLength) ||
      contentLength < 1 ||
      contentLength > 32_000
    ) {
      throw new WebsiteStudioError('WEBSITE_INVALID', 'The website data form is too large.');
    }
    const form = await request.formData();
    const values = Object.fromEntries(
      [...form.entries()]
        .filter(([key, value]) => key.startsWith('field-') && typeof value === 'string')
        .map(([key, value]) => [key.slice('field-'.length), value]),
    );
    const input = WebsitePublicDataSubmissionSchema.parse({
      formKey: params.formKey,
      idempotencyKey: form.get('idempotencyKey'),
      pageSlug: form.get('pageSlug'),
      values,
      website: form.get('website') ?? undefined,
    });
    const website = await getPublishedWebsiteBySlug(params.siteSlug);
    if (website === undefined) {
      return responseDocument('找不到網站', '此網站目前未發布。', '/', 404);
    }
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    backHref =
      websiteSiteSlugFromHost(host) === params.siteSlug
        ? `/${input.pageSlug}`
        : `/s/${params.siteSlug}/${input.pageSlug}`;
    const result = await submitPublishedWebsiteDataForm(website, input);
    return responseDocument('資料已送出', result.message, backHref, 201);
  } catch (error) {
    const forbidden = error instanceof WebsiteStudioError && error.code === 'WEBSITE_FORBIDDEN';
    const limited = error instanceof WebsiteStudioError && error.code === 'WEBSITE_RATE_LIMITED';
    return responseDocument(
      forbidden ? '需要會員權限' : limited ? '請稍後再試' : '無法送出資料',
      forbidden
        ? '請先登入符合表單要求的網站會員帳號。'
        : limited
          ? '此網站目前收到過多表單資料，請稍後再試。'
          : '請檢查所有欄位後再送出。',
      backHref,
      forbidden ? 403 : limited ? 429 : 400,
    );
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
