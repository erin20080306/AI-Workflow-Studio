import { describe, expect, it } from 'vitest';

import {
  WebsiteBriefDraftSchema,
  WebsiteBriefPatchSchema,
  completeWebsiteBrief,
  websiteBriefProgress,
} from './website';

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
