import { describe, expect, it } from 'vitest';

import {
  WebsiteIntegrationPlanInputSchema,
  defaultProviderForKind,
  emptyWebsiteIntegrationChecklist,
  websiteIntegrationGuide,
  websiteIntegrationPlanStatus,
} from './website-integration-guidance';

describe('website integration guidance', () => {
  it('keeps every provider destination allowlisted and every secret server-only', () => {
    const providers = [
      defaultProviderForKind('contact'),
      defaultProviderForKind('analytics'),
      defaultProviderForKind('payment'),
      defaultProviderForKind('api'),
    ] as const;
    const guides = providers.map((provider) => websiteIntegrationGuide(provider, 'zh-Hant'));

    expect(guides.map((guide) => new URL(guide.actionUrl).hostname)).toEqual([
      'resend.com',
      'vercel.com',
      'dashboard.stripe.com',
      'supabase.com',
    ]);
    for (const guide of guides) {
      expect(guide.prerequisites.length).toBeGreaterThanOrEqual(3);
      expect(guide.serverComponent.length).toBeGreaterThan(0);
      expect(guide.testMode.length).toBeGreaterThan(0);
      expect(guide.secretNames.every((name) => !name.startsWith('NEXT_PUBLIC_'))).toBe(true);
    }
  });

  it('requires every safety check before accepting a provider test', () => {
    const checklist = emptyWebsiteIntegrationChecklist();
    expect(websiteIntegrationPlanStatus(checklist)).toBe('draft');

    const ready = {
      ...checklist,
      callbackUrlsConfigured: true,
      privacyReviewed: true,
      providerAccountReady: true,
      secretNamesConfigured: true,
      serverRuntimeReady: true,
    };
    expect(websiteIntegrationPlanStatus(ready)).toBe('ready_for_test');
    expect(
      WebsiteIntegrationPlanInputSchema.safeParse({
        checklist: { ...checklist, explicitConfirmation: true },
        kind: 'payment',
        provider: 'stripe-checkout',
      }).success,
    ).toBe(false);
    expect(
      WebsiteIntegrationPlanInputSchema.parse({
        checklist: { ...ready, explicitConfirmation: true, testPassed: true },
        kind: 'payment',
        provider: 'stripe-checkout',
      }).checklist.explicitConfirmation,
    ).toBe(true);
  });

  it('rejects providers assigned to the wrong module', () => {
    expect(
      WebsiteIntegrationPlanInputSchema.safeParse({
        checklist: emptyWebsiteIntegrationChecklist(),
        kind: 'contact',
        provider: 'stripe-checkout',
      }).success,
    ).toBe(false);
  });
});
