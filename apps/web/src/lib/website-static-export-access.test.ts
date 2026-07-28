import { describe, expect, it } from 'vitest';

import {
  canDownloadWebsiteExport,
  canPublishWebsiteToGithub,
} from './website-static-export-access';

describe('website static export access', () => {
  it('allows active and grace-period paid subscriptions', () => {
    expect(
      canDownloadWebsiteExport({
        platformAdmin: false,
        subscription: { plan: 'pro', status: 'active' },
      }),
    ).toBe(true);
    expect(
      canDownloadWebsiteExport({
        platformAdmin: false,
        subscription: { plan: 'team', status: 'past_due' },
      }),
    ).toBe(true);
  });

  it('rejects free, trial, canceled, and incomplete customer subscriptions', () => {
    expect(
      canDownloadWebsiteExport({
        platformAdmin: false,
        subscription: { plan: 'free', status: 'active' },
      }),
    ).toBe(false);
    expect(
      canDownloadWebsiteExport({
        platformAdmin: false,
        subscription: { plan: 'pro', status: 'trialing' },
      }),
    ).toBe(false);
    expect(
      canDownloadWebsiteExport({
        platformAdmin: false,
        subscription: { plan: 'business', status: 'canceled' },
      }),
    ).toBe(false);
    expect(
      canDownloadWebsiteExport({
        platformAdmin: false,
        subscription: { plan: 'team', status: 'incomplete' },
      }),
    ).toBe(false);
  });

  it('allows platform administrators to support and verify exports', () => {
    expect(
      canDownloadWebsiteExport({
        platformAdmin: true,
        subscription: { plan: 'free', status: 'active' },
      }),
    ).toBe(true);
  });
});

describe('GitHub website publishing entitlement', () => {
  it('requires both a paid entitlement and an owner or administrator role', () => {
    expect(
      canPublishWebsiteToGithub({
        actor: { role: 'owner' },
        platformAdmin: false,
        subscription: { plan: 'team', status: 'active' },
      }),
    ).toBe(true);
    expect(
      canPublishWebsiteToGithub({
        actor: { role: 'editor' },
        platformAdmin: false,
        subscription: { plan: 'team', status: 'active' },
      }),
    ).toBe(false);
    expect(
      canPublishWebsiteToGithub({
        actor: { role: 'owner' },
        platformAdmin: false,
        subscription: { plan: 'free', status: 'active' },
      }),
    ).toBe(false);
  });
});
