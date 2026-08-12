import { AiGatewayError } from '@ai-workflow-studio/ai-gateway';
import {
  WebsiteBriefConversationAnalysisSchema,
  WebsiteSpecSchema,
  WebsiteThemeSchema,
  createWebsiteSpecForBriefSchema,
  websiteBriefProgress,
  type WebsiteBrief,
  type WebsiteBriefConversationAnalysis,
  type WebsiteBriefStep,
  type WebsiteProject,
  type WebsitePromptStartInput,
  type WebsiteSpec,
} from '@ai-workflow-studio/website-schema';

const questionCopy: Readonly<
  Record<WebsiteBriefStep, { readonly en: string; readonly zhHant: string }>
> = {
  audience: {
    en: 'Who is the primary audience, and what problem should this website help them solve?',
    zhHant: '這個網站最主要要服務誰？希望幫他們解決什麼問題？',
  },
  brandDirection: {
    en: 'What should the brand feel like? Mention tone, color direction, and anything to avoid.',
    zhHant: '你希望品牌給人什麼感覺？請描述語氣、色彩方向，以及想避免的風格。',
  },
  callsToAction: {
    en: 'What is the most important action visitors should take?',
    zhHant: '你最希望訪客採取哪一個行動？例如預約、購買或聯絡。',
  },
  content: {
    en: 'What content, proof, pricing, FAQs, or media is available or still needed?',
    zhHant: '目前有哪些文案、案例、價格、常見問題或圖片？還缺少哪些內容？',
  },
  pages: {
    en: 'Which pages are needed, and what should each page help the visitor do?',
    zhHant: '網站需要哪些頁面？每一頁應該幫訪客完成什麼事？',
  },
  purpose: {
    en: 'What is the main business outcome this website should achieve?',
    zhHant: '這個網站最重要的商業目標是什麼？怎樣才算成功？',
  },
};

const pagePatterns = [
  {
    en: { goal: 'Introduce the brand and guide visitors to the primary action.', title: 'Home' },
    pattern: /首頁|\bhome\b/iu,
    slug: 'home',
    zhHant: { goal: '介紹品牌並引導訪客採取主要行動。', title: '首頁' },
  },
  {
    en: { goal: 'Explain the brand story, values, and reason to trust it.', title: 'Brand story' },
    pattern: /品牌故事|brand\s+story/iu,
    slug: 'brand-story',
    zhHant: { goal: '說明品牌故事、價值與值得信任的原因。', title: '品牌故事' },
  },
  {
    en: { goal: 'Explain the organization, team, and background.', title: 'About' },
    pattern: /關於(?:我們)?|\babout\b/iu,
    slug: 'about',
    zhHant: { goal: '介紹組織、團隊與背景。', title: '關於我們' },
  },
  {
    en: { goal: 'Present the available products, menu, or service choices.', title: 'Menu' },
    pattern: /菜單|餐點|\bmenu\b/iu,
    slug: 'menu',
    zhHant: { goal: '呈現可選擇的產品、菜單或服務內容。', title: '菜單' },
  },
  {
    en: {
      goal: 'Explain the services and help visitors choose the right option.',
      title: 'Services',
    },
    pattern: /服務(?:頁面|介紹|內容)|\bservices?\b/iu,
    slug: 'services',
    zhHant: { goal: '說明服務內容並協助訪客選擇適合的方案。', title: '服務' },
  },
  {
    en: { goal: 'Explain the product capabilities and practical value.', title: 'Features' },
    pattern: /功能|\bfeatures?\b/iu,
    slug: 'features',
    zhHant: { goal: '說明產品功能與實際價值。', title: '功能' },
  },
  {
    en: { goal: 'Compare plans and help visitors choose confidently.', title: 'Pricing' },
    pattern: /方案|價格|費率|\bpricing\b/iu,
    slug: 'pricing',
    zhHant: { goal: '比較方案並協助訪客安心選擇。', title: '方案費率' },
  },
  {
    en: { goal: 'Answer frequent questions before visitors take action.', title: 'FAQ' },
    pattern: /常見問題|\bfaq\b/iu,
    slug: 'faq',
    zhHant: { goal: '在訪客採取行動前回答常見問題。', title: '常見問題' },
  },
  {
    en: { goal: 'Let visitors contact the team or make a reservation.', title: 'Contact' },
    pattern: /聯絡(?:我們)?|預約|\bcontact\b/iu,
    slug: 'contact',
    zhHant: { goal: '讓訪客聯絡團隊或提出預約。', title: '聯絡我們' },
  },
] as const;

function safeCopy(value: string, minimum: number, maximum: number, fallback: string): string {
  const cleaned = value
    .replaceAll(/https?:\/\/\S+/giu, '外部連結')
    .replaceAll(/javascript:|data:text\/html|<\s*\/?\s*script[^>]*>|```/giu, '')
    .replaceAll(
      /(?:^|\s)(?:npm|pnpm|yarn|bun|bash|sh|python|node)\s+(?:run|exec|install)\b/giu,
      ' ',
    )
    .replaceAll(/[<>{}`]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
  return cleaned.length >= minimum ? cleaned : fallback.slice(0, maximum);
}

function safeName(description: string, locale: 'en' | 'zh-Hant'): string {
  const normalized = safeCopy(description, 2, 42, locale === 'en' ? 'New website' : '新網站');
  return normalized.length >= 2 ? normalized : locale === 'en' ? 'New website' : '新網站';
}

function inferredAudience(description: string, locale: 'en' | 'zh-Hant'): string {
  const chinese =
    /(?:主要服務|目標(?:客群|受眾)|受眾(?:是|為)?|服務(?!價值|內容|項目|介紹|特色|功能))[：:\s]*([^，。,.；;]{2,80})/iu.exec(
      description,
    )?.[1];
  const english = /(?:for|serves?|audience(?:\s+is)?)[：:\s]+([^,.；;]{2,80})/iu.exec(
    description,
  )?.[1];
  const audience = safeCopy(chinese ?? english ?? '', 2, 160, '');
  if (audience.length < 2) return '';
  return locale === 'en'
    ? `The primary audience is ${audience}, with a clear need for the value described in this request.`
    : `主要受眾為「${audience}」，並需要這項網站所說明的價值與服務。`;
}

function inferredCallsToAction(description: string): string[] {
  const match =
    /(?:主要按鈕(?:是|為)?|主要行動(?:是|為)?|引導訪客|cta(?:\s+is)?)[：:\s]*([^，。,.；;]{2,80})/iu.exec(
      description,
    )?.[1];
  const action = safeCopy(match ?? '', 2, 80, '');
  return action.length < 2 ? [] : [action];
}

/**
 * Strong signals that the brief is a shop/storefront rather than a marketing site.
 * Deliberately excludes the generic word "product/產品" (common for SaaS) so only a
 * clear commerce intent turns on the storefront sections.
 */
const COMMERCE_INTENT_PATTERN =
  /商店|商城|電商|網店|網購|網路商店|購物|商品|賣場|販售|銷售|零售|下單|訂購|結帳|購物車|購物袋|選物|型錄|加入購物|立即購買|立即選購|賣家|拍賣|上架|\bshop\b|\bstore\b|\bstores\b|e-?commerce|\bcommerce\b|storefront|\bcart\b|checkout|\bretail\b|\bmerch\b|catalog(?:ue)?|buy\s+now|order\s+online|\bsell\b|\bselling\b|shopping/iu;

function looksLikeStore(brief: WebsiteBrief, projectName: string): boolean {
  const haystack = [
    projectName,
    brief.purpose,
    brief.content,
    brief.audience,
    ...brief.callsToAction,
    ...brief.pages.flatMap((page) => [page.title, page.goal]),
  ].join(' ');
  return COMMERCE_INTENT_PATTERN.test(haystack);
}

interface StorefrontProduct {
  readonly badge?: string;
  readonly currency: string;
  readonly name: string;
  readonly price: number;
  readonly priceLabel: string;
  readonly sku: string;
  readonly stock: number;
}

/** Deterministic bounded placeholder catalogue so the cart and checkout light up. */
function storefrontProducts(locale: 'en' | 'zh-Hant'): readonly StorefrontProduct[] {
  if (locale === 'en') {
    return [
      {
        badge: 'Bestseller',
        currency: '$',
        name: 'Organic cotton shirt',
        price: 128,
        priceLabel: '$128',
        sku: 'AN-101',
        stock: 24,
      },
      {
        badge: 'New',
        currency: '$',
        name: 'Handmade leather bag',
        price: 268,
        priceLabel: '$268',
        sku: 'AN-204',
        stock: 8,
      },
      {
        currency: '$',
        name: 'Tailored wide trousers',
        price: 188,
        priceLabel: '$188',
        sku: 'AN-306',
        stock: 3,
      },
      {
        currency: '$',
        name: 'Everyday knit sweater',
        price: 158,
        priceLabel: '$158',
        sku: 'AN-408',
        stock: 0,
      },
    ];
  }
  return [
    {
      badge: '熱銷',
      currency: 'NT$',
      name: '經典有機棉上衣',
      price: 1280,
      priceLabel: 'NT$1,280',
      sku: 'AN-101',
      stock: 24,
    },
    {
      badge: '新品',
      currency: 'NT$',
      name: '手工皮革肩背包',
      price: 2680,
      priceLabel: 'NT$2,680',
      sku: 'AN-204',
      stock: 8,
    },
    {
      currency: 'NT$',
      name: '立體剪裁寬褲',
      price: 1880,
      priceLabel: 'NT$1,880',
      sku: 'AN-306',
      stock: 3,
    },
    {
      currency: 'NT$',
      name: '日常針織衫',
      price: 1580,
      priceLabel: 'NT$1,580',
      sku: 'AN-408',
      stock: 0,
    },
  ];
}

/**
 * A complete storefront home page written as real shop copy (not the raw brief),
 * so a store brief reads like a shop even without a live model. The product-grid
 * turns on the interactive cart, and every field stays editable in the Canvas.
 */
function commerceHomeSections(
  pageSlug: string,
  projectName: string,
  primaryAction: string,
  locale: 'en' | 'zh-Hant',
): readonly WebsiteSpec['pages'][number]['sections'][number][] {
  const products = storefrontProducts(locale);
  const shopAction = {
    label: primaryAction,
    target: { kind: 'section' as const, sectionId: `${pageSlug}-products` },
  };
  const en = locale === 'en';
  return [
    {
      body: en
        ? "Explore this season's edit, add your favourites to the bag, and check out online in minutes. Free shipping on qualifying orders."
        : '探索本季精選商品，把喜歡的款式加入購物袋，幾個步驟就能線上結帳，指定金額再享免運。',
      eyebrow: en ? 'New this season' : '當季新品上市',
      id: `${pageSlug}-hero`,
      layout: 'split' as const,
      primaryAction: shopAction,
      title: safeCopy(projectName, 3, 140, en ? 'Shop the collection' : '質感選物・線上選購'),
      type: 'hero' as const,
    },
    {
      body: en
        ? 'A smooth shopping experience from browsing to checkout.'
        : '從瀏覽到結帳，提供順暢的線上購物體驗。',
      columns: '3' as const,
      id: `${pageSlug}-features`,
      items: en
        ? [
            {
              body: 'Free shipping once your order reaches the threshold.',
              icon: 'globe' as const,
              title: 'Free shipping',
            },
            {
              body: 'In-stock items are prepared and dispatched quickly.',
              icon: 'clock' as const,
              title: 'Fast dispatch',
            },
            {
              body: 'A secure checkout that sends every order to your admin inbox.',
              icon: 'lock' as const,
              title: 'Secure checkout',
            },
          ]
        : [
            {
              body: '單筆訂單達指定金額即享免運，購物更輕鬆。',
              icon: 'globe' as const,
              title: '滿額免運',
            },
            { body: '現貨商品下單後盡快為你安排出貨。', icon: 'clock' as const, title: '快速出貨' },
            {
              body: '結帳流程安全可靠，訂單直接進入後台收件匣。',
              icon: 'lock' as const,
              title: '安全結帳',
            },
          ],
      title: en ? 'Why shop with us' : '在這裡購物的理由',
      type: 'feature-grid' as const,
    },
    {
      body: en
        ? 'Add any item to your bag and check out when you are ready.'
        : '把喜歡的商品加入購物袋，準備好隨時結帳。',
      columns: '4' as const,
      eyebrow: en ? 'Curated now' : '本週選品',
      id: `${pageSlug}-products`,
      items: products.map((product) => ({
        ...(product.badge === undefined ? {} : { badge: product.badge }),
        currency: product.currency,
        name: product.name,
        price: product.price,
        priceLabel: product.priceLabel,
        sku: product.sku,
        stock: product.stock,
      })),
      title: en ? 'Shop the collection' : '選購當季商品',
      type: 'product-grid' as const,
    },
    {
      eyebrow: en ? 'Lookbook' : '造型特輯',
      id: `${pageSlug}-gallery`,
      items: en
        ? [
            { caption: 'Weekday edit' },
            { caption: 'Weekend layering' },
            { caption: 'Signature accessories' },
          ]
        : [{ caption: '平日穿搭' }, { caption: '週末層次' }, { caption: '經典配件' }],
      layout: 'grid' as const,
      title: en ? 'This season in looks' : '本季造型特輯',
      type: 'gallery' as const,
    },
    {
      action: shopAction,
      body: en
        ? 'Add your favourites to the bag and check out online in minutes.'
        : '把喜歡的商品加入購物袋，立即完成線上結帳。',
      id: `${pageSlug}-shop-cta`,
      title: en ? 'Ready to shop?' : '準備好開始選購了嗎？',
      type: 'cta' as const,
    },
  ];
}

function inferredPages(description: string, locale: 'en' | 'zh-Hant') {
  const matches = pagePatterns
    .map((page) => ({ index: description.search(page.pattern), page }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index);
  const selected =
    matches.length === 0
      ? [{ index: 0, page: pagePatterns[0] }]
      : matches.some((match) => match.page.slug === 'home')
        ? matches
        : [{ index: -1, page: pagePatterns[0] }, ...matches];
  return selected.slice(0, 12).map(({ page }) => ({
    goal: locale === 'en' ? page.en.goal : page.zhHant.goal,
    slug: page.slug,
    title: locale === 'en' ? page.en.title : page.zhHant.title,
  }));
}

export function createSafeWebsitePromptAnalysis(
  input: WebsitePromptStartInput,
): WebsiteBriefConversationAnalysis {
  const description = safeCopy(
    input.description,
    10,
    6_000,
    input.locale === 'en'
      ? 'Create a clear website that explains the requested value.'
      : '建立一個清楚說明需求價值的網站。',
  );
  const brief = {
    audience: inferredAudience(description, input.locale),
    brandDirection:
      input.locale === 'en'
        ? 'Clear, professional, trustworthy, and modern with an accessible visual hierarchy.'
        : '專業、清楚、可信任且現代，並維持容易閱讀的視覺層級。',
    callsToAction: inferredCallsToAction(description),
    content: description,
    pages: inferredPages(description, input.locale),
    purpose: description,
  };
  const progress = websiteBriefProgress(brief);
  return WebsiteBriefConversationAnalysisSchema.parse({
    brief,
    name: safeName(description, input.locale),
    questions: progress.missingSteps.slice(0, 3).map((step) => ({
      body: input.locale === 'en' ? questionCopy[step].en : questionCopy[step].zhHant,
      step,
    })),
  });
}

export function createSafeWebsiteSpec(
  project: WebsiteProject,
  brief: WebsiteBrief,
  locale: 'en' | 'zh-Hant',
): WebsiteSpec {
  const projectName = safeCopy(project.name, 2, 120, 'Website Studio');
  const commerce = looksLikeStore(brief, projectName);
  const primaryAction = safeCopy(
    brief.callsToAction[0] ?? '',
    1,
    80,
    commerce
      ? locale === 'en'
        ? 'Shop now'
        : '立即選購'
      : locale === 'en'
        ? 'Contact us'
        : '聯絡我們',
  );
  const pages = brief.pages.map((page, index) => {
    const pageTitle = safeCopy(page.title, 1, 80, locale === 'en' ? 'Page' : '頁面');
    const commonCta = {
      action: {
        label: primaryAction,
        target: { channel: 'form' as const, kind: 'contact' as const },
      },
      body:
        locale === 'en'
          ? 'Tell us what you want to achieve and we will help you choose the next safe step.'
          : '告訴我們你想達成的成果，我們會協助你選擇下一個安全步驟。',
      id: `${page.slug}-cta`,
      title: locale === 'en' ? 'Ready for the next step?' : '準備好進行下一步了嗎？',
      type: 'cta' as const,
    };
    const footer = {
      copyright:
        locale === 'en' ? `${projectName} · All rights reserved` : `${projectName} · 保留所有權利`,
      id: `${page.slug}-footer`,
      links: brief.pages.slice(0, 6).map((targetPage) => ({
        label: safeCopy(targetPage.title, 1, 60, locale === 'en' ? 'Page' : '頁面'),
        target: { kind: 'page' as const, pageSlug: targetPage.slug },
      })),
      type: 'footer' as const,
    };
    return {
      metaDescription: safeCopy(page.goal, 10, 200, brief.purpose),
      sections:
        index === 0
          ? commerce
            ? [...commerceHomeSections(page.slug, projectName, primaryAction, locale), footer]
            : [
                {
                  body: safeCopy(brief.purpose, 10, 700, page.goal),
                  id: `${page.slug}-hero`,
                  layout: 'split' as const,
                  primaryAction: {
                    label: primaryAction,
                    target: { channel: 'form' as const, kind: 'contact' as const },
                  },
                  title: safeCopy(
                    page.title,
                    3,
                    140,
                    locale === 'en' ? projectName : `${projectName} 首頁`,
                  ),
                  type: 'hero' as const,
                },
                {
                  body: safeCopy(brief.content, 10, 400, brief.purpose),
                  columns: '3' as const,
                  id: `${page.slug}-features`,
                  items: [
                    {
                      body:
                        locale === 'en'
                          ? 'A clear structure turns your brief into reviewable website decisions.'
                          : '將需求轉成清楚、可檢視的網站決策。',
                      icon: 'workflow' as const,
                      title: locale === 'en' ? 'Structured' : '結構清楚',
                    },
                    {
                      body:
                        locale === 'en'
                          ? 'Only registered components and bounded content are accepted.'
                          : '只接受已註冊元件與有上限的內容。',
                      icon: 'shield' as const,
                      title: locale === 'en' ? 'Validated' : '安全驗證',
                    },
                    {
                      body:
                        locale === 'en'
                          ? 'Every page remains a draft until explicit publishing approval.'
                          : '所有頁面在明確核准發布前都維持草稿。',
                      icon: 'check' as const,
                      title: locale === 'en' ? 'Reviewable' : '可供核准',
                    },
                  ],
                  title: locale === 'en' ? 'Built for a safe workflow' : '為安全流程而設計',
                  type: 'feature-grid' as const,
                },
                commonCta,
                footer,
              ]
          : [
              {
                body: safeCopy(page.goal, 10, 1_500, brief.content),
                id: `${page.slug}-content`,
                layout: 'text' as const,
                title: safeCopy(pageTitle, 3, 120, locale === 'en' ? 'Page details' : '頁面內容'),
                type: 'content' as const,
              },
              commonCta,
              footer,
            ],
      slug: page.slug,
      title: pageTitle,
    };
  });
  return createWebsiteSpecForBriefSchema(brief).parse({
    assets: [],
    locale,
    name: projectName,
    navigation: {
      brandLabel: safeCopy(projectName, 1, 80, 'Website Studio'),
      items: brief.pages.map((page) => ({
        label: safeCopy(page.title, 1, 60, locale === 'en' ? 'Page' : '頁面'),
        pageSlug: page.slug,
      })),
    },
    pages,
    schemaVersion: 1,
    theme: {
      appearance: 'light',
      density: 'airy',
      palette: 'indigo-mint',
      radius: 'rounded',
      typography: 'modern-sans',
    },
  });
}

export function createSafeWebsiteEdit(
  specValue: WebsiteSpec,
  instruction: string,
): WebsiteSpec | undefined {
  const patch: Partial<WebsiteSpec['theme']> = {};
  if (/深色|暗色|\bdark\b/iu.test(instruction)) patch.appearance = 'dark';
  else if (/淺色|明亮|\blight\b/iu.test(instruction)) patch.appearance = 'light';
  else if (/跟隨系統|系統主題|\bsystem\b/iu.test(instruction)) patch.appearance = 'system';

  if (/緊湊|精簡|\bcompact\b/iu.test(instruction)) patch.density = 'compact';
  else if (/留白|寬鬆|\bairy\b/iu.test(instruction)) patch.density = 'airy';
  else if (/平衡|\bbalanced\b/iu.test(instruction)) patch.density = 'balanced';

  if (/膠囊|\bpill\b/iu.test(instruction)) patch.radius = 'pill';
  else if (/圓角|\brounded\b/iu.test(instruction)) patch.radius = 'rounded';
  else if (/柔和|\bsoft\b/iu.test(instruction)) patch.radius = 'soft';

  if (/靛藍|薄荷|\bindigo\b|\bmint\b/iu.test(instruction)) patch.palette = 'indigo-mint';
  else if (/石墨|琥珀|暖色|\bgraphite\b|\bamber\b/iu.test(instruction))
    patch.palette = 'graphite-amber';
  else if (/海軍藍|青色|\bnavy\b|\bcyan\b/iu.test(instruction)) patch.palette = 'navy-cyan';
  else if (/森林|沙色|綠色|\bforest\b|\bsand\b/iu.test(instruction)) patch.palette = 'forest-sand';
  else if (/紫羅蘭|玫瑰|紫色|粉色|\bviolet\b|\brose\b/iu.test(instruction))
    patch.palette = 'violet-rose';

  if (/雜誌|編輯風|\beditorial\b/iu.test(instruction)) patch.typography = 'editorial';
  else if (/科技|技術感|\btechnical\b/iu.test(instruction)) patch.typography = 'technical';
  else if (/親切|友善|\bfriendly\b/iu.test(instruction)) patch.typography = 'friendly';
  else if (/現代|\bmodern\b/iu.test(instruction)) patch.typography = 'modern-sans';

  if (Object.keys(patch).length === 0) return undefined;
  const spec = WebsiteSpecSchema.parse(structuredClone(specValue));
  spec.theme = WebsiteThemeSchema.parse({ ...spec.theme, ...patch });
  return WebsiteSpecSchema.parse(spec);
}

export function isSafeWebsiteProviderFallback(error: unknown): error is AiGatewayError {
  return (
    error instanceof AiGatewayError &&
    [
      'AI_OUTPUT_INVALID',
      'AI_PROVIDER_AUTHENTICATION_FAILED',
      'AI_PROVIDER_NOT_CONFIGURED',
      'AI_PROVIDER_QUOTA_EXCEEDED',
      'AI_PROVIDER_RATE_LIMITED',
      'AI_PROVIDER_REQUEST_FAILED',
      'AI_PROVIDER_RESPONSE_INVALID',
      'AI_PROVIDER_TIMEOUT',
    ].includes(error.code)
  );
}
