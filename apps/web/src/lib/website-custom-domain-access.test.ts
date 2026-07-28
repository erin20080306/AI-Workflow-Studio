import { describe, expect, it } from 'vitest';

import { canManageWebsiteCustomDomains } from './website-custom-domain-access';

describe('website custom-domain access', () => {
  it('allows paid workspace owners and administrators', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(
        canManageWebsiteCustomDomains({
          actor: {
            role,
            tenantId: '10000000-0000-4000-8000-000000000001',
            userId: '10000000-0000-4000-8000-000000000002',
          },
          platformAdmin: false,
          subscription: { plan: 'pro', status: 'active' },
        }),
      ).toBe(true);
    }
  });

  it('rejects free, trial, canceled, editor, and viewer customer access', () => {
    const denied = [
      { plan: 'free', role: 'owner', status: 'active' },
      { plan: 'pro', role: 'owner', status: 'trialing' },
      { plan: 'team', role: 'owner', status: 'canceled' },
      { plan: 'business', role: 'editor', status: 'active' },
      { plan: 'business', role: 'viewer', status: 'active' },
    ] as const;

    for (const candidate of denied) {
      expect(
        canManageWebsiteCustomDomains({
          actor: {
            role: candidate.role,
            tenantId: '10000000-0000-4000-8000-000000000001',
            userId: '10000000-0000-4000-8000-000000000002',
          },
          platformAdmin: false,
          subscription: {
            plan: candidate.plan,
            status: candidate.status,
          },
        }),
      ).toBe(false);
    }
  });

  it('allows platform administrators to support domain setup', () => {
    expect(
      canManageWebsiteCustomDomains({
        actor: {
          role: 'viewer',
          tenantId: '10000000-0000-4000-8000-000000000001',
          userId: '10000000-0000-4000-8000-000000000002',
        },
        platformAdmin: true,
        subscription: { plan: 'free', status: 'incomplete' },
      }),
    ).toBe(true);
  });
});
