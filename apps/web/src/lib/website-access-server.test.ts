import { WebsiteSpecSchema } from '@ai-workflow-studio/website-schema';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceContext } from './auth/context';

vi.mock('server-only', () => ({}));
vi.mock('./env', () => ({
  getEnvironment: () => ({ mockMode: true }),
}));
vi.mock('@/lib/env', () => ({
  getEnvironment: () => ({ mockMode: true }),
}));
vi.mock('./supabase/server', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('Production storage must not be used by the mock access test.');
  },
  createSupabaseServerClient: () => {
    throw new Error('Production identity must not be used by the mock access test.');
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('Production storage must not be used by the mock access test.');
  },
  createSupabaseServerClient: () => {
    throw new Error('Production identity must not be used by the mock access test.');
  },
}));

const spec = WebsiteSpecSchema.parse({
  assets: [],
  locale: 'zh-Hant',
  name: 'Site access fixture',
  navigation: {
    brandLabel: 'Site access fixture',
    items: [
      { label: '首頁', pageSlug: 'home' },
      { label: '會員中心', pageSlug: 'member-portal' },
    ],
  },
  pages: [
    {
      metaDescription: 'A public home page.',
      sections: [
        {
          body: 'Public website content.',
          id: 'home-content',
          layout: 'text',
          title: '網站首頁',
          type: 'content',
        },
      ],
      slug: 'home',
      title: '首頁',
    },
    {
      metaDescription: 'A protected member portal.',
      sections: [
        {
          body: 'Protected website content.',
          id: 'portal-content',
          layout: 'text',
          title: '會員中心',
          type: 'content',
        },
      ],
      slug: 'member-portal',
      title: '會員中心',
    },
  ],
  schemaVersion: 1,
  theme: {
    appearance: 'light',
    density: 'balanced',
    palette: 'indigo-mint',
    radius: 'rounded',
    typography: 'modern-sans',
  },
});

vi.mock('./website-spec-server', () => ({
  getWebsiteSpecGeneration: () => Promise.resolve({ spec }),
}));
vi.mock('@/lib/website-spec-server', () => ({
  getWebsiteSpecGeneration: () => Promise.resolve({ spec }),
}));

const context: WorkspaceContext = {
  actor: {
    role: 'owner',
    tenantId: '10000000-0000-4000-8000-000000004301',
    userId: '10000000-0000-4000-8000-000000004302',
  },
  displayName: 'Site owner',
  email: 'site-owner@example.invalid',
  platformAdmin: false,
  subscription: { plan: 'free', status: 'active' },
  tenant: {
    id: '10000000-0000-4000-8000-000000004301',
    name: 'Site access workspace',
    slug: 'site-access',
  },
};

describe('website site users and access', () => {
  it('requires review, separates site membership, and enforces role and suspension', async () => {
    const { createWebsiteProject } = await import('./website-studio-server');
    const {
      executeWebsiteSiteAuth,
      getWebsitePageAccessState,
      getWebsiteSiteAccessDashboard,
      mutateWebsiteSiteAccess,
    } = await import('./website-access-server');
    const project = await createWebsiteProject(context, {
      name: `Access ${crypto.randomUUID()}`,
    });
    const publishedWebsite = {
      projectId: project.id,
      publication: {
        id: crypto.randomUUID(),
        projectId: project.id,
        publicPath: '/s/site-access-fixture',
        publishedAt: new Date().toISOString(),
        slug: 'site-access-fixture',
        status: 'active' as const,
        version: 1,
      },
      tenantId: context.actor.tenantId,
    };

    const initial = await getWebsiteSiteAccessDashboard(context, project.id);
    expect(initial.registrationEnabled).toBe(false);
    expect(initial.members).toEqual([]);
    expect(initial.rules).toEqual([
      expect.objectContaining({ pageSlug: 'home', requiredRole: null }),
      expect.objectContaining({
        pageSlug: 'member-portal',
        requiredRole: null,
        suggestedRole: 'member',
      }),
    ]);

    await expect(
      mutateWebsiteSiteAccess(context, project.id, {
        action: 'save-matrix',
        confirmed: true,
        registrationEnabled: true,
        rules: [{ pageSlug: 'home', requiredRole: null }],
      }),
    ).rejects.toMatchObject({ code: 'WEBSITE_INVALID' });

    const reviewed = await mutateWebsiteSiteAccess(context, project.id, {
      action: 'save-matrix',
      confirmed: true,
      registrationEnabled: true,
      rules: [
        { pageSlug: 'home', requiredRole: null },
        { pageSlug: 'member-portal', requiredRole: 'member' },
      ],
    });
    expect(reviewed.members).toEqual([
      expect.objectContaining({
        email: context.email,
        role: 'manager',
        userId: context.actor.userId,
      }),
    ]);

    const visitorEmail = `member-${crypto.randomUUID()}@example.com`;
    const auth = await executeWebsiteSiteAuth(publishedWebsite, {
      action: 'register',
      confirmPassword: 'SiteMember123',
      displayName: 'Separate site member',
      email: visitorEmail,
      pageSlug: 'member-portal',
      password: 'SiteMember123',
    });
    expect(auth.kind).toBe('authenticated');
    expect(auth.mockSessionToken).toBeDefined();
    expect(
      await getWebsitePageAccessState(publishedWebsite, 'member-portal', auth.mockSessionToken),
    ).toMatchObject({
      allowed: true,
      member: {
        displayName: 'Separate site member',
        role: 'member',
        userId: expect.not.stringMatching(context.actor.userId),
      },
      requiredRole: 'member',
    });

    const member = (await getWebsiteSiteAccessDashboard(context, project.id)).members.find(
      (candidate) => candidate.email === visitorEmail,
    );
    expect(member).toBeDefined();
    await mutateWebsiteSiteAccess(context, project.id, {
      action: 'update-member',
      memberId: member!.id,
      role: 'member',
      status: 'suspended',
    });
    expect(
      await getWebsitePageAccessState(publishedWebsite, 'member-portal', auth.mockSessionToken),
    ).toMatchObject({ allowed: false, member: { status: 'suspended' } });
  });

  it('allows only workspace owners and administrators to change site access', async () => {
    const { createWebsiteProject } = await import('./website-studio-server');
    const { mutateWebsiteSiteAccess } = await import('./website-access-server');
    const project = await createWebsiteProject(context, {
      name: `Access role ${crypto.randomUUID()}`,
    });
    const viewerContext: WorkspaceContext = {
      ...context,
      actor: { ...context.actor, role: 'viewer' },
    };
    await expect(
      mutateWebsiteSiteAccess(viewerContext, project.id, {
        action: 'save-matrix',
        confirmed: true,
        registrationEnabled: false,
        rules: [
          { pageSlug: 'home', requiredRole: null },
          { pageSlug: 'member-portal', requiredRole: null },
        ],
      }),
    ).rejects.toMatchObject({ code: 'WEBSITE_FORBIDDEN' });
  });
});
