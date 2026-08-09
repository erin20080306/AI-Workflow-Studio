import { describe, expect, it } from 'vitest';

import { WebsiteSpecSchema } from '@ai-workflow-studio/website-schema';

import {
  compileWebsiteBlueprint,
  WEBSITE_BLUEPRINT_PROVIDER_JSON_SCHEMA,
  WebsiteBlueprintOutputSchema,
  WebsiteBlueprintSchema,
} from './website-blueprint';

const brief = {
  audience: '服務台北剛開始接觸瑜伽的上班族。',
  brandDirection: '溫暖、專業並保留大量呼吸感。',
  callsToAction: ['立即預約體驗課'],
  content: '提供課程、師資與聯絡方式的完整介紹。',
  pages: [
    { goal: '介紹品牌並引導預約體驗課。', slug: 'home', title: '首頁' },
    { goal: '清楚說明適合初學者的課程。', slug: 'classes', title: '課程' },
  ],
  purpose: '讓初學者安心了解課程並完成體驗預約。',
};

const project = {
  brief,
  completedSteps: 6,
  createdAt: '2026-07-28T00:00:00.000Z',
  createdBy: '11111111-1111-4111-8111-111111111111',
  id: '22222222-2222-4222-8222-222222222222',
  name: '瑜伽日常',
  slug: 'yoga-daily',
  status: 'draft' as const,
  tenantId: '33333333-3333-4333-8333-333333333333',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

const blueprint = WebsiteBlueprintSchema.parse({
  name: '瑜伽日常',
  pages: [
    {
      metaDescription: '台北初學者友善的瑜伽體驗與課程預約。',
      sections: [
        {
          body: '從第一堂課開始，找到舒服而穩定的練習節奏。',
          eyebrow: '初學者友善',
          items: [],
          layout: 'split',
          title: '讓瑜伽成為你的日常',
          type: 'hero',
        },
        {
          body: '由專業老師帶領，提供清楚而安心的練習安排。',
          eyebrow: '課程特色',
          items: [
            { body: '小班教學與清楚引導。', title: '安心入門' },
            { body: '彈性時段適合上班族。', title: '方便預約' },
          ],
          layout: 'centered',
          title: '適合你的第一堂課',
          type: 'feature-grid',
        },
      ],
      slug: 'home',
      title: '首頁',
    },
  ],
  theme: {
    appearance: 'light',
    density: 'airy',
    palette: 'forest-sand',
    radius: 'rounded',
    typography: 'friendly',
  },
});

describe('website blueprint compiler', () => {
  it('keeps the provider schema compact enough for structured model APIs', () => {
    expect(JSON.stringify(WEBSITE_BLUEPRINT_PROVIDER_JSON_SCHEMA).length).toBeLessThan(4_000);
  });

  it('compiles AI content into registered website sections and preserves required pages', () => {
    const spec = compileWebsiteBlueprint(project, brief, 'zh-Hant', blueprint);
    expect(WebsiteSpecSchema.parse(spec)).toEqual(spec);
    expect(spec.pages).toHaveLength(2);
    expect(spec.pages[0]?.sections.map((section) => section.type)).toEqual([
      'hero',
      'feature-grid',
      'footer',
    ]);
    expect(spec.pages[1]?.slug).toBe('classes');
    expect(spec.theme.palette).toBe('forest-sand');
  });

  it('rejects executable or externally hosted content before compilation', () => {
    expect(() =>
      WebsiteBlueprintSchema.parse({
        ...blueprint,
        pages: [
          {
            ...blueprint.pages[0],
            sections: [
              {
                ...blueprint.pages[0]?.sections[0],
                body: '<script>alert(1)</script>',
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it('discards unknown model metadata before compiling the registered specification', () => {
    const parsed = WebsiteBlueprintSchema.parse({
      ...blueprint,
      explanation: 'This model-only metadata is not part of the website.',
      pages: blueprint.pages.map((page) => ({
        ...page,
        confidence: 0.98,
        sections: page.sections.map((section) => ({
          ...section,
          notes: 'Ignored by the safe compiler.',
        })),
      })),
    });
    expect(parsed).not.toHaveProperty('explanation');
    expect(parsed.pages[0]).not.toHaveProperty('confidence');
    expect(parsed.pages[0]?.sections[0]).not.toHaveProperty('notes');
    expect(() => compileWebsiteBlueprint(project, brief, 'zh-Hant', parsed)).not.toThrow();
  });

  it('normalizes one safe model wrapper before validation', () => {
    expect(WebsiteBlueprintOutputSchema.parse({ blueprint })).toEqual(blueprint);
    expect(WebsiteBlueprintOutputSchema.parse([blueprint])).toEqual(blueprint);
  });

  it('fills an omitted CTA description with validated brief content', () => {
    const parsed = WebsiteBlueprintSchema.parse({
      ...blueprint,
      pages: [
        {
          ...blueprint.pages[0],
          sections: [
            ...blueprint.pages[0]!.sections,
            { body: '', title: '準備好開始了嗎？', type: 'cta' },
          ],
        },
      ],
    });
    const spec = compileWebsiteBlueprint(project, brief, 'zh-Hant', parsed);
    const cta = spec.pages[0]?.sections.find((section) => section.type === 'cta');
    expect(cta).toMatchObject({
      body: '準備好開始了嗎？ — 立即預約體驗課',
      type: 'cta',
    });
  });

  it('fills an empty CTA title and description with the validated action', () => {
    const parsed = WebsiteBlueprintSchema.parse({
      ...blueprint,
      pages: [
        {
          ...blueprint.pages[0],
          sections: [...blueprint.pages[0]!.sections, { body: '', title: '', type: 'cta' }],
        },
      ],
    });
    const spec = compileWebsiteBlueprint(project, brief, 'zh-Hant', parsed);
    const cta = spec.pages[0]?.sections.find((section) => section.type === 'cta');
    expect(cta).toMatchObject({
      body: '立即預約體驗課 — 立即預約體驗課',
      title: '立即預約體驗課',
      type: 'cta',
    });
  });

  it('compiles the richer stats, testimonial, pricing, and faq sections into a valid spec', () => {
    const parsed = WebsiteBlueprintSchema.parse({
      ...blueprint,
      pages: [
        {
          ...blueprint.pages[0],
          sections: [
            blueprint.pages[0]!.sections[0],
            {
              body: '',
              metrics: [
                { label: '學員滿意度', value: '98%' },
                { label: '累積開課', value: '1,200+' },
              ],
              title: '值得信賴的成果',
              type: 'stats',
            },
            {
              attribution: '陳小姐',
              body: '',
              quote: '第一次上課就完全放鬆，老師的引導很細膩。',
              role: '上班族學員',
              title: '學員回饋',
              type: 'testimonial',
            },
            {
              body: '',
              plans: [
                {
                  description: '適合想先體驗的初學者。',
                  features: ['單堂體驗', '專人引導'],
                  highlighted: true,
                  name: '體驗方案',
                  priceLabel: 'NT$300',
                },
              ],
              title: '方案價格',
              type: 'pricing',
            },
            {
              body: '',
              questions: [
                { answer: '完全不需要，我們會從最基礎開始。', question: '沒有經驗可以上嗎？' },
              ],
              title: '常見問題',
              type: 'faq',
            },
          ],
          slug: 'home',
        },
      ],
    });
    const spec = compileWebsiteBlueprint(project, brief, 'zh-Hant', parsed);
    expect(WebsiteSpecSchema.parse(spec)).toEqual(spec);
    const types = spec.pages[0]?.sections.map((section) => section.type);
    expect(types).toEqual(['hero', 'stats', 'testimonial', 'pricing', 'faq', 'footer']);
    const stats = spec.pages[0]?.sections.find((section) => section.type === 'stats') as
      { items: { label: string; value: string }[] } | undefined;
    expect(stats?.items[0]).toEqual({ label: '學員滿意度', value: '98%' });
    expect(stats?.items).toHaveLength(2);
  });

  it('compiles a product-grid into commerce cards and parses a numeric price for the cart', () => {
    const parsed = WebsiteBlueprintSchema.parse({
      ...blueprint,
      pages: [
        {
          ...blueprint.pages[0],
          sections: [
            blueprint.pages[0]!.sections[0],
            {
              body: '每一件都經得起日復一日的穿著。',
              eyebrow: '本週選品',
              products: [
                {
                  availabilityLabel: '現貨 18',
                  badge: '新品',
                  name: '雲感落肩襯衫',
                  priceLabel: 'NT$1,680',
                  sku: 'AN-101',
                  variant: '霧白 / M',
                },
                { name: '有機棉針織衫', priceLabel: '請洽詢' },
              ],
              title: '本週新品',
              type: 'product-grid',
            },
          ],
          slug: 'home',
        },
      ],
    });
    const spec = compileWebsiteBlueprint(project, brief, 'zh-Hant', parsed);
    expect(WebsiteSpecSchema.parse(spec)).toEqual(spec);
    const grid = spec.pages[0]?.sections.find((section) => section.type === 'product-grid') as
      | {
          columns: string;
          items: {
            badge?: string;
            name: string;
            price?: number;
            priceLabel: string;
            sku?: string;
            variant?: string;
          }[];
        }
      | undefined;
    expect(grid?.columns).toBe('2');
    expect(grid?.items[0]).toMatchObject({
      badge: '新品',
      name: '雲感落肩襯衫',
      price: 1680,
      priceLabel: 'NT$1,680',
      sku: 'AN-101',
      variant: '霧白 / M',
    });
    // A non-numeric price label carries no cart amount.
    expect(grid?.items[1]).not.toHaveProperty('price');
  });

  it('compiles a gallery into captioned media items', () => {
    const parsed = WebsiteBlueprintSchema.parse({
      ...blueprint,
      pages: [
        {
          ...blueprint.pages[0],
          sections: [
            blueprint.pages[0]!.sections[0],
            {
              body: '從街拍到日常，感受材質的重量。',
              eyebrow: 'Lookbook',
              media: [{ caption: '晨光 / 城市' }, { caption: '靜物 / 材質' }],
              title: '本季形象',
              type: 'gallery',
            },
          ],
          slug: 'home',
        },
      ],
    });
    const spec = compileWebsiteBlueprint(project, brief, 'zh-Hant', parsed);
    expect(WebsiteSpecSchema.parse(spec)).toEqual(spec);
    const gallery = spec.pages[0]?.sections.find((section) => section.type === 'gallery') as
      { items: { caption?: string }[]; layout: string } | undefined;
    expect(gallery?.layout).toBe('grid');
    expect(gallery?.items.map((item) => item.caption)).toEqual(['晨光 / 城市', '靜物 / 材質']);
  });

  it('pads a stats section with too few metrics so it still satisfies the spec', () => {
    const parsed = WebsiteBlueprintSchema.parse({
      ...blueprint,
      pages: [
        {
          ...blueprint.pages[0],
          sections: [
            blueprint.pages[0]!.sections[0],
            {
              body: '',
              metrics: [{ label: '滿意度', value: '99%' }],
              title: '成果',
              type: 'stats',
            },
          ],
          slug: 'home',
        },
      ],
    });
    const spec = compileWebsiteBlueprint(project, brief, 'zh-Hant', parsed);
    const stats = spec.pages[0]?.sections.find((section) => section.type === 'stats');
    expect(stats?.type).toBe('stats');
    expect((stats as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(2);
    expect(WebsiteSpecSchema.parse(spec)).toEqual(spec);
  });
});
