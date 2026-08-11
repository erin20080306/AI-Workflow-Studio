import { WebsiteCheckoutInputSchema } from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { createWebsiteOrder } from '@/lib/website-admin-server';
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
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta content="width=device-width,initial-scale=1" name="viewport"><title>${escapeHtml(
      title,
    )}</title><style>:root{font-family:Inter,system-ui,sans-serif;color:#0f172a;background:#f8fafc}*{box-sizing:border-box}body{display:grid;min-height:100vh;margin:0;place-items:center;padding:24px}.card{width:min(560px,100%);border:1px solid #dbe3ee;border-radius:28px;background:#fff;padding:36px;box-shadow:0 24px 60px #0f172a14}h1{font-size:30px;margin:0}p{color:#5b6b82;line-height:1.7}.button{display:inline-block;margin-top:16px;border-radius:999px;background:#4f46e5;color:#fff;font-weight:800;padding:12px 20px;text-decoration:none}</style></head><body><main class="card"><h1>${escapeHtml(
      title,
    )}</h1><p>${escapeHtml(message)}</p><a class="button" href="${escapeHtml(
      backHref,
    )}">返回網站</a></main></body></html>`,
    { headers: RESPONSE_HEADERS, status },
  );
}

function parseItems(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 12_000) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function POST(
  request: Request,
  routeContext: { readonly params: Promise<{ readonly siteSlug: string }> },
): Promise<Response> {
  let backHref = '/';
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const contentLengthHeader = request.headers.get('content-length');
    const contentLength = Number(contentLengthHeader);
    if (
      contentLengthHeader === null ||
      !Number.isSafeInteger(contentLength) ||
      contentLength < 1 ||
      contentLength > 32_000
    ) {
      throw new WebsiteStudioError('WEBSITE_INVALID', 'The checkout request is too large.');
    }
    const form = await request.formData();
    const input = WebsiteCheckoutInputSchema.parse({
      email: form.get('email'),
      items: parseItems(form.get('items')),
      name: form.get('name'),
      pageSlug: form.get('pageSlug'),
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
    const order = await createWebsiteOrder(website, input);
    return responseDocument(
      '訂單已送出',
      `已收到你的訂單，共 ${order.itemCount} 件商品，小計 ${order.currency}${order.subtotal.toLocaleString()}。網站管理者會盡快處理。`,
      backHref,
      201,
    );
  } catch (error) {
    const limited = error instanceof WebsiteStudioError && error.code === 'WEBSITE_RATE_LIMITED';
    return responseDocument(
      limited ? '請稍後再試' : '無法送出訂單',
      limited
        ? '短時間內送出過多訂單，請稍後再試。'
        : '訂單內容有誤或商品已無庫存，請返回網站重新確認購物袋。',
      backHref,
      limited ? 429 : 400,
    );
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
