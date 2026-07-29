import { z } from 'zod';

export const WebsiteIntegrationKindSchema = z.enum(['analytics', 'api', 'contact', 'payment']);

export const WebsiteIntegrationProviderSchema = z.enum([
  'resend-contact',
  'stripe-checkout',
  'supabase-edge-function',
  'vercel-web-analytics',
]);

export const WebsiteIntegrationChecklistSchema = z
  .object({
    callbackUrlsConfigured: z.boolean(),
    explicitConfirmation: z.boolean(),
    privacyReviewed: z.boolean(),
    providerAccountReady: z.boolean(),
    secretNamesConfigured: z.boolean(),
    serverRuntimeReady: z.boolean(),
    testPassed: z.boolean(),
  })
  .strict();

export const WebsiteIntegrationPlanInputSchema = z
  .object({
    checklist: WebsiteIntegrationChecklistSchema,
    kind: WebsiteIntegrationKindSchema,
    provider: WebsiteIntegrationProviderSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!providerSupportsKind(value.kind, value.provider)) {
      context.addIssue({
        code: 'custom',
        message: 'The selected integration provider does not support this module.',
        path: ['provider'],
      });
    }
    if (
      value.checklist.explicitConfirmation &&
      (!value.checklist.callbackUrlsConfigured ||
        !value.checklist.privacyReviewed ||
        !value.checklist.providerAccountReady ||
        !value.checklist.secretNamesConfigured ||
        !value.checklist.serverRuntimeReady ||
        !value.checklist.testPassed)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Explicit confirmation is only accepted after every safety check passes.',
        path: ['checklist', 'explicitConfirmation'],
      });
    }
  });

export const WebsiteIntegrationPlanStatusSchema = z.enum([
  'draft',
  'ready_for_test',
  'test_accepted',
]);

export const WebsiteIntegrationPlanSchema = WebsiteIntegrationPlanInputSchema.and(
  z
    .object({
      status: WebsiteIntegrationPlanStatusSchema,
      updatedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
);

export const WebsiteIntegrationPlansResponseSchema = z
  .object({
    plans: z.array(WebsiteIntegrationPlanSchema),
  })
  .strict();

export const WebsiteIntegrationPlanResponseSchema = z
  .object({
    plan: WebsiteIntegrationPlanSchema,
  })
  .strict();

export type WebsiteIntegrationKind = z.infer<typeof WebsiteIntegrationKindSchema>;
export type WebsiteIntegrationProvider = z.infer<typeof WebsiteIntegrationProviderSchema>;
export type WebsiteIntegrationChecklist = z.infer<typeof WebsiteIntegrationChecklistSchema>;
export type WebsiteIntegrationPlanInput = z.infer<typeof WebsiteIntegrationPlanInputSchema>;
export type WebsiteIntegrationPlan = z.infer<typeof WebsiteIntegrationPlanSchema>;
export type WebsiteIntegrationPlanStatus = z.infer<typeof WebsiteIntegrationPlanStatusSchema>;

export type WebsiteIntegrationGuide = Readonly<{
  account: string;
  actionUrl: string;
  callbacks: readonly string[];
  dataFlow: string;
  kind: WebsiteIntegrationKind;
  privacyImpact: string;
  provider: WebsiteIntegrationProvider;
  providerLabel: string;
  prerequisites: readonly string[];
  publicPlaceholders: readonly string[];
  secretNames: readonly string[];
  serverComponent: string;
  testMode: string;
}>;

const providersByKind: Readonly<
  Record<WebsiteIntegrationKind, readonly WebsiteIntegrationProvider[]>
> = {
  analytics: ['vercel-web-analytics'],
  api: ['supabase-edge-function'],
  contact: ['resend-contact'],
  payment: ['stripe-checkout'],
};

export function providerSupportsKind(
  kind: WebsiteIntegrationKind,
  provider: WebsiteIntegrationProvider,
): boolean {
  return providersByKind[kind].includes(provider);
}

export function defaultProviderForKind(kind: WebsiteIntegrationKind): WebsiteIntegrationProvider {
  switch (kind) {
    case 'analytics':
      return 'vercel-web-analytics';
    case 'api':
      return 'supabase-edge-function';
    case 'contact':
      return 'resend-contact';
    case 'payment':
      return 'stripe-checkout';
  }
}

export function emptyWebsiteIntegrationChecklist(): WebsiteIntegrationChecklist {
  return {
    callbackUrlsConfigured: false,
    explicitConfirmation: false,
    privacyReviewed: false,
    providerAccountReady: false,
    secretNamesConfigured: false,
    serverRuntimeReady: false,
    testPassed: false,
  };
}

export function websiteIntegrationPlanStatus(
  checklist: WebsiteIntegrationChecklist,
): WebsiteIntegrationPlanStatus {
  if (checklist.explicitConfirmation) return 'test_accepted';
  if (
    checklist.callbackUrlsConfigured &&
    checklist.privacyReviewed &&
    checklist.providerAccountReady &&
    checklist.secretNamesConfigured &&
    checklist.serverRuntimeReady
  ) {
    return 'ready_for_test';
  }
  return 'draft';
}

export function websiteIntegrationGuide(
  provider: WebsiteIntegrationProvider,
  locale: 'en' | 'zh-Hant',
): WebsiteIntegrationGuide {
  const en = locale === 'en';

  switch (provider) {
    case 'resend-contact':
      return {
        account: en ? 'A verified Resend sending domain' : '已驗證寄件網域的 Resend 帳戶',
        actionUrl: 'https://resend.com/api-keys',
        callbacks: ['/api/contact'],
        dataFlow: en
          ? 'Browser form → validated server endpoint → Resend → approved recipient inbox.'
          : '瀏覽器表單 → 驗證後端端點 → Resend → 已核准收件信箱。',
        kind: 'contact',
        prerequisites: en
          ? [
              'Deploy a server function that validates, rate-limits, and size-limits every submission.',
              'Verify the sending domain and configure an approved recipient address.',
              'Add abuse protection and do not log full message bodies.',
            ]
          : [
              '部署後端函式，驗證並限制每次送出的頻率與內容大小。',
              '驗證寄件網域並設定核准的收件地址。',
              '加入防濫用機制，且不要在日誌記錄完整訊息內容。',
            ],
        privacyImpact: en
          ? 'Collects the visitor name, contact address, and message for the stated reply purpose.'
          : '會蒐集訪客姓名、聯絡方式與訊息，僅可用於已說明的回覆目的。',
        provider: 'resend-contact',
        providerLabel: 'Resend · Contact delivery',
        publicPlaceholders: [],
        secretNames: ['RESEND_API_KEY', 'CONTACT_TO_EMAIL'],
        serverComponent: en
          ? 'Validated contact API route or serverless function'
          : '具輸入驗證的聯絡 API 路由或 Serverless Function',
        testMode: en
          ? 'Send only to an approved test recipient and verify rate-limit and failure states.'
          : '只寄送到核准測試收件者，並驗證頻率限制與失敗狀態。',
      };
    case 'stripe-checkout':
      return {
        account: en ? 'A Stripe account with sandbox access' : '可使用 Sandbox 的 Stripe 帳戶',
        actionUrl: 'https://dashboard.stripe.com/test/apikeys',
        callbacks: ['/api/payments/checkout', '/api/webhooks/stripe', '/checkout/success'],
        dataFlow: en
          ? 'Browser → server-created Checkout Session → Stripe-hosted Checkout → signed webhook → order fulfillment.'
          : '瀏覽器 → 後端建立 Checkout Session → Stripe 代管結帳 → 簽章 Webhook → 訂單履行。',
        kind: 'payment',
        prerequisites: en
          ? [
              'Create Checkout Sessions only on the server with an idempotency key.',
              'Verify the raw webhook body and Stripe signature before fulfillment.',
              'Test success, cancellation, duplicate webhook, and delayed-payment paths.',
            ]
          : [
              '只能在後端建立 Checkout Session，並使用冪等鍵。',
              '履行訂單前必須驗證 Webhook 原始內容與 Stripe 簽章。',
              '測試成功、取消、重複 Webhook 與延遲付款流程。',
            ],
        privacyImpact: en
          ? 'Stripe processes payment details; the site should retain only the minimum order and reconciliation identifiers.'
          : '付款資料由 Stripe 處理；網站只應保存最少的訂單與對帳識別資訊。',
        provider: 'stripe-checkout',
        providerLabel: 'Stripe · Hosted Checkout',
        publicPlaceholders: ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'],
        secretNames: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
        serverComponent: en
          ? 'Checkout Session endpoint plus signed webhook handler'
          : 'Checkout Session 後端端點與簽章 Webhook 處理器',
        testMode: en
          ? 'Stripe sandbox keys and test Checkout; live collection remains disabled.'
          : '使用 Stripe Sandbox 金鑰與測試結帳；正式收款維持停用。',
      };
    case 'supabase-edge-function':
      return {
        account: en
          ? 'A Supabase project with Edge Functions'
          : '已開啟 Edge Functions 的 Supabase 專案',
        actionUrl: 'https://supabase.com/dashboard/project/_/functions',
        callbacks: ['/functions/v1/site-api-proxy'],
        dataFlow: en
          ? 'Browser → allowlisted Edge Function → authenticated external API → validated response.'
          : '瀏覽器 → 白名單 Edge Function → 經驗證的外部 API → 驗證後回應。',
        kind: 'api',
        prerequisites: en
          ? [
              'Allowlist the upstream host, methods, request schema, and response schema.',
              'Apply authentication, rate limits, timeouts, and response-size limits in the function.',
              'Keep the upstream credential in Edge Function secrets and never forward it to the browser.',
            ]
          : [
              '明確列出允許的上游主機、方法、請求與回應 Schema。',
              '在函式中實施驗證、頻率限制、逾時與回應大小上限。',
              '上游憑證只能放在 Edge Function Secrets，絕不傳回瀏覽器。',
            ],
        privacyImpact: en
          ? 'Selected visitor input is sent to the configured upstream API; document the fields and retention policy.'
          : '指定的訪客輸入會送到設定的上游 API；必須說明欄位與保留政策。',
        provider: 'supabase-edge-function',
        providerLabel: 'Supabase · Edge Function API proxy',
        publicPlaceholders: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
        secretNames: ['EXTERNAL_API_KEY'],
        serverComponent: en
          ? 'Allowlisted Edge Function proxy with runtime validation'
          : '具白名單與執行期驗證的 Edge Function Proxy',
        testMode: en
          ? 'Use a sandbox upstream account and verify denied hosts, malformed input, timeout, and quota behavior.'
          : '使用 Sandbox 上游帳戶，驗證禁止主機、錯誤輸入、逾時與額度行為。',
      };
    case 'vercel-web-analytics':
      return {
        account: en ? 'The customer-owned Vercel project' : '客戶自己的 Vercel 專案',
        actionUrl: 'https://vercel.com/docs/analytics',
        callbacks: [],
        dataFlow: en
          ? 'Published pages → Vercel Analytics event collection → aggregated project dashboard.'
          : '已發布頁面 → Vercel Analytics 事件蒐集 → 專案彙總儀表板。',
        kind: 'analytics',
        prerequisites: en
          ? [
              'Enable Web Analytics only on the intended Vercel project.',
              'Disclose analytics use and honor applicable consent requirements.',
              'Verify that preview traffic is separated from production review.',
            ]
          : [
              '只在預定的 Vercel 專案啟用 Web Analytics。',
              '揭露分析用途並遵守適用的同意要求。',
              '確認預覽流量不會混入正式環境驗收。',
            ],
        privacyImpact: en
          ? 'Aggregated page-view and navigation measurements are sent to the selected analytics provider.'
          : '彙總頁面瀏覽與導覽量測會送到所選分析服務。',
        provider: 'vercel-web-analytics',
        providerLabel: 'Vercel · Web Analytics',
        publicPlaceholders: [],
        secretNames: [],
        serverComponent: en
          ? 'Provider-managed analytics adapter; no custom API server required'
          : '服務商代管的分析 Adapter；不需要自建 API 後端',
        testMode: en
          ? 'Use a preview deployment and confirm no sensitive form values are captured.'
          : '使用 Preview 部署，確認不會蒐集敏感表單值。',
      };
  }
}
