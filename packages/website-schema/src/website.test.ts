import { describe, expect, it } from 'vitest';

import {
  WebsiteBriefDraftSchema,
  WebsiteBriefPatchSchema,
  completeWebsiteBrief,
  websiteBriefProgress,
} from './website';
import {
  WebsiteSpecEditInputSchema,
  WebsiteSpecGenerationSchema,
  WebsiteSpecSchema,
  compareWebsiteSpecs,
  createWebsiteSpecForBriefSchema,
} from './spec';

const completeBrief = {
  audience: '營運團隊與需要安全自動化工具的中小企業使用者。',
  brandDirection: '專業、清楚、可信任，以深藍與薄荷綠呈現科技感。',
  callsToAction: ['免費開始', '預約產品導覽'],
  content: '介紹產品價值、安全機制、主要功能、方案差異與常見問題。',
  pages: [
    {
      goal: '說明產品價值並引導使用者註冊。',
      slug: 'home',
      title: '首頁',
    },
  ],
  purpose: '建立 AI Workflow Studio 的產品網站並取得合格註冊名單。',
} as const;

describe('Website brief validation', () => {
  it('requires every guided step before completing a brief', () => {
    const draft = WebsiteBriefDraftSchema.parse({
      purpose: completeBrief.purpose,
    });
    expect(websiteBriefProgress(draft)).toEqual({
      complete: false,
      completedSteps: 1,
      missingSteps: ['audience', 'pages', 'brandDirection', 'content', 'callsToAction'],
    });
    expect(() => completeWebsiteBrief(draft)).toThrow();
  });

  it('accepts a complete bounded website brief', () => {
    const brief = completeWebsiteBrief(WebsiteBriefDraftSchema.parse(completeBrief));
    expect(websiteBriefProgress(brief)).toMatchObject({
      complete: true,
      completedSteps: 6,
      missingSteps: [],
    });
    expect(brief.pages[0]?.slug).toBe('home');
  });

  it('rejects duplicate slugs, duplicate calls to action, and unknown patch fields', () => {
    expect(() =>
      WebsiteBriefDraftSchema.parse({
        pages: [
          completeBrief.pages[0],
          { goal: 'Second page goal', slug: 'home', title: 'Duplicate' },
        ],
      }),
    ).toThrow();
    expect(() => WebsiteBriefDraftSchema.parse({ callsToAction: ['Start', 'start'] })).toThrow();
    expect(() => WebsiteBriefPatchSchema.parse({ providerApiKey: 'secret' })).toThrow();
  });
});

const validWebsiteSpec = {
  assets: [],
  locale: 'zh-Hant',
  name: 'AI Workflow Studio',
  navigation: {
    brandLabel: 'AI Workflow Studio',
    items: [{ label: '首頁', pageSlug: 'home' }],
  },
  pages: [
    {
      metaDescription: '安全建立、驗證並核准自動化網站工作流程。',
      sections: [
        {
          body: '將自然語言需求轉成可檢視、可核准的網站結構。',
          id: 'home-hero',
          layout: 'split',
          primaryAction: {
            label: '免費開始',
            target: { channel: 'form', kind: 'contact' },
          },
          title: '安全建立網站工作流程',
          type: 'hero',
        },
        {
          copyright: 'AI Workflow Studio · 保留所有權利',
          id: 'home-footer',
          links: [
            {
              label: '首頁',
              target: { kind: 'page', pageSlug: 'home' },
            },
          ],
          type: 'footer',
        },
      ],
      slug: 'home',
      title: '首頁',
    },
  ],
  schemaVersion: 1,
  theme: {
    appearance: 'light',
    density: 'airy',
    palette: 'indigo-mint',
    radius: 'rounded',
    typography: 'modern-sans',
  },
} as const;

describe('Website Spec validation', () => {
  it('accepts only registered, internally linked component JSON', () => {
    const spec = WebsiteSpecSchema.parse(validWebsiteSpec);
    expect(spec.pages[0]?.sections.map((section) => section.type)).toEqual(['hero', 'footer']);
  });

  it('rejects executable content, arbitrary URLs, and unknown components', () => {
    expect(() =>
      WebsiteSpecSchema.parse({
        ...validWebsiteSpec,
        pages: [
          {
            ...validWebsiteSpec.pages[0],
            sections: [
              {
                body: 'Run this command now: pnpm exec node unsafe.js',
                id: 'unsafe',
                layout: 'text',
                title: 'Unsafe content',
                type: 'content',
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      WebsiteSpecSchema.parse({
        ...validWebsiteSpec,
        navigation: {
          ...validWebsiteSpec.navigation,
          items: [{ label: '外部網站', pageSlug: 'https://example.com' }],
        },
      }),
    ).toThrow();
    expect(() =>
      WebsiteSpecSchema.parse({
        ...validWebsiteSpec,
        pages: [
          {
            ...validWebsiteSpec.pages[0],
            sections: [{ code: 'alert(1)', id: 'custom', type: 'custom-html' }],
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects missing page, section, and asset references', () => {
    expect(() =>
      WebsiteSpecSchema.parse({
        ...validWebsiteSpec,
        assets: [],
        pages: [
          {
            ...validWebsiteSpec.pages[0],
            sections: [
              {
                assetId: 'missing-asset',
                body: '足夠長度的安全內容，不包含外部網址或程式碼。',
                id: 'home-content',
                layout: 'image-left',
                title: '內容介紹',
                type: 'content',
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      WebsiteSpecSchema.parse({
        ...validWebsiteSpec,
        navigation: {
          ...validWebsiteSpec.navigation,
          items: [{ label: '不存在', pageSlug: 'missing' }],
        },
      }),
    ).toThrow();
  });

  it('requires generated pages to exactly match the validated brief', () => {
    const brief = completeWebsiteBrief(WebsiteBriefDraftSchema.parse(completeBrief));
    expect(createWebsiteSpecForBriefSchema(brief).parse(validWebsiteSpec).pages).toHaveLength(1);
    expect(() =>
      createWebsiteSpecForBriefSchema({
        ...brief,
        pages: [...brief.pages, { goal: '說明方案內容與價格。', slug: 'pricing', title: '方案' }],
      }).parse(validWebsiteSpec),
    ).toThrow();
  });

  it('accepts bounded direct and natural-language edits without executable content', () => {
    expect(
      WebsiteSpecEditInputSchema.parse({
        edit: {
          field: 'title',
          pageSlug: 'home',
          sectionId: 'home-hero',
          type: 'update-section-copy',
          value: '更清楚的安全網站標題',
        },
        kind: 'direct',
        versionName: 'Homepage headline',
      }).kind,
    ).toBe('direct');
    expect(
      WebsiteSpecEditInputSchema.parse({
        instruction: '請讓首頁標題更簡潔，並保留所有既有頁面與內容。',
        kind: 'natural-language',
        locale: 'zh-Hant',
        model: 'auto',
        tier: 'economy',
        versionName: 'AI copy edit',
      }).kind,
    ).toBe('natural-language');
    expect(() =>
      WebsiteSpecEditInputSchema.parse({
        instruction: 'Run this: ```javascript alert(1) ```',
        kind: 'natural-language',
        versionName: 'Unsafe edit',
      }),
    ).toThrow();
  });

  it('records reversible version metadata and compares deterministic spec changes', () => {
    const generation = WebsiteSpecGenerationSchema.parse({
      attempts: 1,
      changeSummary: 'Updated the validated website theme.',
      createdAt: '2026-07-28T00:00:00.000Z',
      model: 'test-model',
      parentVersion: 1,
      provider: 'mock',
      source: 'direct',
      spec: {
        ...validWebsiteSpec,
        theme: { ...validWebsiteSpec.theme, density: 'compact' },
      },
      version: 2,
      versionName: 'Compact layout',
    });
    const comparison = compareWebsiteSpecs(
      WebsiteSpecSchema.parse(validWebsiteSpec),
      generation.spec,
    );
    expect(generation.parentVersion).toBe(1);
    expect(comparison.changedThemeProperties).toEqual(['density']);
    expect(comparison.changedPages).toEqual([]);
    expect(comparison.changedSections).toBe(0);
  });
});
