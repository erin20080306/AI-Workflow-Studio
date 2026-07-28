import { AiGatewayError } from '@ai-workflow-studio/ai-gateway';
import {
  WebsiteBriefConversationAnalysisSchema,
  WebsiteSpecSchema,
  completeWebsiteBrief,
  websiteBriefProgress,
  type WebsiteProject,
} from '@ai-workflow-studio/website-schema';
import { describe, expect, it } from 'vitest';

import {
  createSafeWebsiteEdit,
  createSafeWebsitePromptAnalysis,
  createSafeWebsiteSpec,
  isSafeWebsiteProviderFallback,
} from './website-safe-fallback';

const project: WebsiteProject = {
  brief: {
    audience: '主要受眾為台北上班族，並協助他們快速預約喜歡的咖啡餐點。',
    brandDirection: '時尚、專業、溫暖且容易閱讀，使用清楚的品牌層級。',
    callsToAction: ['立即預約'],
    content: '介紹品牌故事、咖啡菜單、門市特色以及可以聯絡團隊的方式。',
    pages: [
      { goal: '介紹品牌並引導訪客立即預約。', slug: 'home', title: '首頁' },
      { goal: '說明品牌理念與咖啡來源。', slug: 'brand-story', title: '品牌故事' },
      { goal: '展示咖啡與餐點選項。', slug: 'menu', title: '菜單' },
      { goal: '提供預約與聯絡管道。', slug: 'contact', title: '聯絡我們' },
    ],
    purpose: '建立專業咖啡品牌網站，讓台北上班族了解品牌並完成預約。',
  },
  briefCompletedAt: '2026-07-28T00:00:00.000Z',
  completedSteps: 6,
  createdAt: '2026-07-28T00:00:00.000Z',
  createdBy: '11111111-1111-4111-8111-111111111111',
  draftCreatedAt: '2026-07-28T00:00:00.000Z',
  id: '22222222-2222-4222-8222-222222222222',
  name: '台北咖啡品牌',
  slug: 'taipei-coffee',
  status: 'draft',
  tenantId: '33333333-3333-4333-8333-333333333333',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

describe('Website Studio safe provider fallback', () => {
  it('extracts stated audience, pages, and CTA from a complete Chinese request', () => {
    const analysis = createSafeWebsitePromptAnalysis({
      description:
        '建立一個專業的中英文咖啡品牌網站，服務台北上班族，包含首頁、品牌故事、菜單與聯絡我們，主要按鈕是立即預約。',
      locale: 'zh-Hant',
      model: 'gemini',
      tier: 'economy',
    });

    expect(WebsiteBriefConversationAnalysisSchema.parse(analysis)).toEqual(analysis);
    expect(analysis.brief.audience).toContain('台北上班族');
    expect(analysis.brief.pages.map((page) => page.slug)).toEqual([
      'home',
      'brand-story',
      'menu',
      'contact',
    ]);
    expect(analysis.brief.callsToAction).toEqual(['立即預約']);
    expect(websiteBriefProgress(analysis.brief).complete).toBe(true);
    expect(analysis.questions).toEqual([]);
  });

  it('asks bounded follow-up questions when a short request omits required decisions', () => {
    const analysis = createSafeWebsitePromptAnalysis({
      description: '幫我建立一個專業清楚的咖啡品牌網站',
      locale: 'zh-Hant',
      model: 'auto',
      tier: 'auto',
    });

    expect(analysis.questions.map((question) => question.step)).toEqual([
      'audience',
      'callsToAction',
    ]);
    expect(analysis.questions).toHaveLength(2);
  });

  it('removes scripts, commands, and external URLs from fallback content', () => {
    const analysis = createSafeWebsitePromptAnalysis({
      description:
        '建立安全產品網站 <script>alert(1)</script> https://malicious.example ``` bash run payload 服務企業採購團隊',
      locale: 'zh-Hant',
      model: 'anthropic',
      tier: 'economy',
    });
    const serialized = JSON.stringify(analysis);

    expect(serialized).not.toMatch(/<script|https?:\/\/|```|bash run/iu);
    expect(WebsiteBriefConversationAnalysisSchema.parse(analysis)).toEqual(analysis);
  });

  it('creates a complete registered-component Website Spec for every brief page', () => {
    const brief = completeWebsiteBrief(project.brief);
    const spec = createSafeWebsiteSpec(project, brief, 'zh-Hant');

    expect(WebsiteSpecSchema.parse(spec)).toEqual(spec);
    expect(spec.pages.map((page) => page.slug)).toEqual(['home', 'brand-story', 'menu', 'contact']);
    expect(spec.pages[0]?.sections.map((section) => section.type)).toEqual([
      'hero',
      'feature-grid',
      'cta',
      'footer',
    ]);
  });

  it('applies only recognized bounded theme instructions', () => {
    const spec = createSafeWebsiteSpec(project, completeWebsiteBrief(project.brief), 'zh-Hant');
    const edited = createSafeWebsiteEdit(spec, '請改成深色主題、森林綠色、圓角並使用科技感字體');

    expect(edited?.theme).toMatchObject({
      appearance: 'dark',
      palette: 'forest-sand',
      radius: 'rounded',
      typography: 'technical',
    });
    expect(createSafeWebsiteEdit(spec, '請幫我重新設計整個內容')).toBeUndefined();
  });

  it('falls back only for provider failures and never for cancellation or usage logging', () => {
    expect(
      isSafeWebsiteProviderFallback(
        new AiGatewayError('AI_PROVIDER_RESPONSE_INVALID', 'invalid response'),
      ),
    ).toBe(true);
    expect(
      isSafeWebsiteProviderFallback(new AiGatewayError('AI_PROVIDER_CANCELLED', 'cancelled')),
    ).toBe(false);
    expect(
      isSafeWebsiteProviderFallback(new AiGatewayError('AI_USAGE_LOG_FAILED', 'usage failed')),
    ).toBe(false);
  });
});
