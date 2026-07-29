import { WebsiteSpecSchema } from '@ai-workflow-studio/website-schema';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceContext } from './auth/context';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  getEnvironment: () => ({ mockMode: true }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('Production storage must not be used by the mock backend test.');
  },
}));

const spec = WebsiteSpecSchema.parse({
  assets: [],
  locale: 'zh-Hant',
  name: 'Website backend fixture',
  navigation: {
    brandLabel: 'Website backend fixture',
    items: [{ label: '首頁', pageSlug: 'home' }],
  },
  pages: [
    {
      metaDescription: 'A safe full-stack website backend fixture.',
      sections: [
        {
          body: 'Use the validated contact form to create a durable inbox record.',
          id: 'hero-main',
          layout: 'centered',
          primaryAction: {
            label: '聯絡我們',
            target: { channel: 'form', kind: 'contact' },
          },
          title: 'Website backend fixture',
          type: 'hero',
        },
      ],
      slug: 'home',
      title: '首頁',
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

vi.mock('@/lib/website-spec-server', () => ({
  getWebsiteSpecGeneration: () =>
    Promise.resolve({
      spec,
    }),
}));

const context: WorkspaceContext = {
  actor: {
    role: 'owner',
    tenantId: '10000000-0000-4000-8000-000000004201',
    userId: '10000000-0000-4000-8000-000000004202',
  },
  displayName: 'Website backend owner',
  email: 'backend-owner@example.invalid',
  platformAdmin: false,
  subscription: { plan: 'free', status: 'active' },
  tenant: {
    id: '10000000-0000-4000-8000-000000004201',
    name: 'Website backend workspace',
    slug: 'website-backend',
  },
};

describe('website admin backend', () => {
  it('persists managed content and contact submissions in the isolated project backend', async () => {
    const { createWebsiteProject } = await import('./website-studio-server');
    const {
      createWebsiteContactSubmission,
      getWebsiteAdminDashboard,
      listPublishedWebsiteContent,
      mutateWebsiteAdmin,
    } = await import('./website-admin-server');
    const project = await createWebsiteProject(context, {
      name: `Backend ${crypto.randomUUID()}`,
    });

    const afterContent = await mutateWebsiteAdmin(context, project.id, {
      action: 'upsert-content',
      body: '這是由網站後台管理並顯示於公開首頁的最新消息。',
      contentKey: 'latest-news',
      pageSlug: 'home',
      status: 'published',
      title: '最新消息',
    });
    expect(afterContent.contentEntries).toHaveLength(1);
    expect(
      await listPublishedWebsiteContent(
        { projectId: project.id, tenantId: context.actor.tenantId },
        'home',
      ),
    ).toEqual([expect.objectContaining({ contentKey: 'latest-news', status: 'published' })]);

    const submission = await createWebsiteContactSubmission(
      {
        projectId: project.id,
        spec,
        tenantId: context.actor.tenantId,
      },
      {
        email: 'Visitor@Example.com',
        message: '我想進一步了解這個網站提供的服務內容。',
        name: '訪客',
        pageSlug: 'home',
        subject: '服務詢問',
      },
    );
    expect(submission.email).toBe('visitor@example.com');

    const afterStatus = await mutateWebsiteAdmin(context, project.id, {
      action: 'update-submission',
      status: 'read',
      submissionId: submission.id,
    });
    expect(afterStatus.submissions).toEqual([
      expect.objectContaining({ id: submission.id, status: 'read' }),
    ]);
    expect(await getWebsiteAdminDashboard(context, project.id)).toEqual(afterStatus);
  });

  it('rejects managed content that targets a page outside the validated Canvas', async () => {
    const { createWebsiteProject } = await import('./website-studio-server');
    const { mutateWebsiteAdmin } = await import('./website-admin-server');
    const project = await createWebsiteProject(context, {
      name: `Invalid ${crypto.randomUUID()}`,
    });
    await expect(
      mutateWebsiteAdmin(context, project.id, {
        action: 'upsert-content',
        body: 'This content cannot target a page outside the Canvas.',
        contentKey: 'invalid-page',
        pageSlug: 'missing',
        status: 'draft',
        title: 'Invalid page',
      }),
    ).rejects.toMatchObject({ code: 'WEBSITE_INVALID' });
  });
});
