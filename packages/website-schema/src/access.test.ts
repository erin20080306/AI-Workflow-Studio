import { describe, expect, it } from 'vitest';

import {
  WebsiteSiteAccessMutationSchema,
  WebsiteSiteAuthInputSchema,
  WebsiteSiteRoleSchema,
} from './access';

describe('website site access schemas', () => {
  it('allowlists only supported site roles', () => {
    expect(WebsiteSiteRoleSchema.options).toEqual(['member', 'staff', 'manager']);
    expect(WebsiteSiteRoleSchema.safeParse('owner').success).toBe(false);
    expect(WebsiteSiteRoleSchema.safeParse('admin').success).toBe(false);
  });

  it('requires an explicitly reviewed unique access matrix', () => {
    expect(
      WebsiteSiteAccessMutationSchema.safeParse({
        action: 'save-matrix',
        confirmed: false,
        registrationEnabled: true,
        rules: [{ pageSlug: 'home', requiredRole: 'member' }],
      }).success,
    ).toBe(false);
    expect(
      WebsiteSiteAccessMutationSchema.safeParse({
        action: 'save-matrix',
        confirmed: true,
        registrationEnabled: true,
        rules: [
          { pageSlug: 'home', requiredRole: 'member' },
          { pageSlug: 'home', requiredRole: 'manager' },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires a bounded mixed-case password and matching confirmation', () => {
    expect(
      WebsiteSiteAuthInputSchema.safeParse({
        action: 'register',
        confirmPassword: 'SiteMember123',
        displayName: 'Site member',
        email: 'member@example.com',
        pageSlug: 'home',
        password: 'SiteMember123',
      }).success,
    ).toBe(true);
    expect(
      WebsiteSiteAuthInputSchema.safeParse({
        action: 'register',
        confirmPassword: 'different-password',
        displayName: 'Site member',
        email: 'member@example.com',
        pageSlug: 'home',
        password: 'alllowercase',
      }).success,
    ).toBe(false);
  });
});
