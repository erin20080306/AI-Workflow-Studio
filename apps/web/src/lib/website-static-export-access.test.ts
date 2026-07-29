import { describe, expect, it } from 'vitest';

import {
  canDownloadWebsiteExport,
  canManageWebsiteIntegrations,
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

describe('website delivery role matrix', () => {
  const sessions = {
    freeOwner: {
      actor: { role: 'owner' as const },
      platformAdmin: false,
      subscription: { plan: 'free' as const, status: 'active' as const },
    },
    paidEditor: {
      actor: { role: 'editor' as const },
      platformAdmin: false,
      subscription: { plan: 'pro' as const, status: 'active' as const },
    },
    paidWorkspaceAdmin: {
      actor: { role: 'admin' as const },
      platformAdmin: false,
      subscription: { plan: 'team' as const, status: 'active' as const },
    },
    platformAdmin: {
      actor: { role: 'owner' as const },
      platformAdmin: true,
      subscription: { plan: 'free' as const, status: 'active' as const },
    },
  };

  it('keeps Free website creation separate from paid source and integration delivery', () => {
    expect(canDownloadWebsiteExport(sessions.freeOwner)).toBe(false);
    expect(canPublishWebsiteToGithub(sessions.freeOwner)).toBe(false);
    expect(canManageWebsiteIntegrations(sessions.freeOwner)).toBe(false);
  });

  it('lets a paid member download without granting administrator external writes', () => {
    expect(canDownloadWebsiteExport(sessions.paidEditor)).toBe(true);
    expect(canPublishWebsiteToGithub(sessions.paidEditor)).toBe(false);
    expect(canManageWebsiteIntegrations(sessions.paidEditor)).toBe(false);
  });

  it('allows paid workspace administrators and platform support administrators', () => {
    for (const session of [sessions.paidWorkspaceAdmin, sessions.platformAdmin]) {
      expect(canDownloadWebsiteExport(session)).toBe(true);
      expect(canPublishWebsiteToGithub(session)).toBe(true);
      expect(canManageWebsiteIntegrations(session)).toBe(true);
    }
  });
});
