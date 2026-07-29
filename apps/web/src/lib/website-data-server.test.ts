import { WebsiteSpecSchema } from '@ai-workflow-studio/website-schema';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceContext } from './auth/context';

vi.mock('server-only', () => ({}));
vi.mock('./env', () => ({ getEnvironment: () => ({ mockMode: true }) }));
vi.mock('@/lib/env', () => ({ getEnvironment: () => ({ mockMode: true }) }));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
}));
vi.mock('./supabase/server', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('Production storage must not be used by the mock data test.');
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('Production storage must not be used by the mock data test.');
  },
}));

const spec = WebsiteSpecSchema.parse({
  assets: [],
  locale: 'zh-Hant',
  name: 'Data site fixture',
  navigation: {
    brandLabel: 'Data site fixture',
    items: [{ label: '預約', pageSlug: 'booking' }],
  },
  pages: [
    {
      metaDescription: 'A booking page.',
      sections: [
        {
          body: 'Book a safe consultation.',
          id: 'booking-content',
          layout: 'text',
          title: '預約諮詢',
          type: 'content',
        },
      ],
      slug: 'booking',
      title: '預約',
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
    tenantId: '10000000-0000-4000-8000-000000004401',
    userId: '10000000-0000-4000-8000-000000004402',
  },
  displayName: 'Data owner',
  email: 'data-owner@example.invalid',
  platformAdmin: false,
  subscription: { plan: 'free', status: 'active' },
  tenant: {
    id: '10000000-0000-4000-8000-000000004401',
    name: 'Data workspace',
    slug: 'data-workspace',
  },
};

const bookingFields = [
  {
    key: 'name',
    label: '姓名',
    options: [],
    referenceCollectionKey: null,
    required: true,
    type: 'text' as const,
  },
  {
    key: 'email',
    label: '電子郵件',
    options: [],
    referenceCollectionKey: null,
    required: true,
    type: 'email' as const,
  },
  {
    key: 'seats',
    label: '人數',
    options: [],
    referenceCollectionKey: null,
    required: true,
    type: 'number' as const,
  },
];

describe('website custom data and safe actions', () => {
  it('reviews collections and forms, validates data, and executes idempotent actions', async () => {
    const { createWebsiteProject } = await import('./website-studio-server');
    const {
      getWebsiteDataDashboard,
      listPublishedWebsiteDataForms,
      mutateWebsiteData,
      submitPublishedWebsiteDataForm,
    } = await import('./website-data-server');
    const project = await createWebsiteProject(context, {
      name: `Data ${crypto.randomUUID()}`,
    });
    await mutateWebsiteData(context, project.id, {
      action: 'upsert-collection',
      collectionKey: 'bookings',
      confirmed: true,
      fields: bookingFields,
      name: '預約',
    });
    await mutateWebsiteData(context, project.id, {
      action: 'upsert-form',
      active: true,
      collectionKey: 'bookings',
      confirmed: true,
      fieldKeys: ['name', 'email', 'seats'],
      formKey: 'booking-form',
      pageSlug: 'booking',
      requiredRole: null,
      submitLabel: '送出預約',
      successMessage: '已收到預約。',
      title: '預約諮詢',
      workflowTrigger: 'audit-record-created',
    });
    const website = { projectId: project.id, tenantId: context.actor.tenantId };
    expect(await listPublishedWebsiteDataForms(website, 'booking')).toEqual([
      expect.objectContaining({
        collection: expect.objectContaining({ collectionKey: 'bookings' }),
        form: expect.objectContaining({ formKey: 'booking-form' }),
      }),
    ]);

    const idempotencyKey = crypto.randomUUID();
    const submitted = await submitPublishedWebsiteDataForm(website, {
      formKey: 'booking-form',
      idempotencyKey,
      pageSlug: 'booking',
      values: { email: 'member@example.com', name: '網站會員', seats: '2' },
      website: '',
    });
    const replay = await submitPublishedWebsiteDataForm(website, {
      formKey: 'booking-form',
      idempotencyKey,
      pageSlug: 'booking',
      values: { email: 'member@example.com', name: '網站會員', seats: '2' },
      website: '',
    });
    expect(replay.record.id).toBe(submitted.record.id);
    expect(submitted.record.values).toEqual({
      email: 'member@example.com',
      name: '網站會員',
      seats: 2,
    });
    await expect(
      submitPublishedWebsiteDataForm(website, {
        formKey: 'booking-form',
        idempotencyKey,
        pageSlug: 'booking',
        values: { email: 'other@example.com', name: '另一位會員', seats: '3' },
        website: '',
      }),
    ).rejects.toMatchObject({ code: 'WEBSITE_STATE_CONFLICT' });

    let dashboard = await getWebsiteDataDashboard(context, project.id);
    expect(dashboard.records).toHaveLength(1);
    expect(dashboard.actions[0]).toMatchObject({
      action: 'create-record',
      trigger: 'audit-record-created',
    });
    dashboard = await mutateWebsiteData(context, project.id, {
      action: 'update-record',
      collectionKey: 'bookings',
      expectedVersion: submitted.record.version,
      idempotencyKey: crypto.randomUUID(),
      recordId: submitted.record.id,
      values: { email: 'member@example.com', name: '網站會員', seats: 4 },
    });
    expect(dashboard.records[0]).toMatchObject({ values: { seats: 4 }, version: 2 });
    dashboard = await mutateWebsiteData(context, project.id, {
      action: 'delete-record',
      collectionKey: 'bookings',
      confirmed: true,
      expectedVersion: 2,
      idempotencyKey: crypto.randomUUID(),
      recordId: submitted.record.id,
    });
    expect(dashboard.records).toEqual([]);
    expect(dashboard.actions.map((action) => action.action)).toEqual([
      'delete-record',
      'update-record',
      'create-record',
    ]);
  });

  it('rejects unknown fields, unreviewed relationships, and viewer mutations', async () => {
    const { createWebsiteProject } = await import('./website-studio-server');
    const { mutateWebsiteData } = await import('./website-data-server');
    const project = await createWebsiteProject(context, {
      name: `Data boundaries ${crypto.randomUUID()}`,
    });
    await mutateWebsiteData(context, project.id, {
      action: 'upsert-collection',
      collectionKey: 'bookings',
      confirmed: true,
      fields: bookingFields,
      name: '預約',
    });
    await expect(
      mutateWebsiteData(context, project.id, {
        action: 'create-record',
        collectionKey: 'bookings',
        idempotencyKey: crypto.randomUUID(),
        values: {
          command: 'shell',
          email: 'member@example.com',
          name: '網站會員',
          seats: 2,
        },
      }),
    ).rejects.toMatchObject({ code: 'WEBSITE_INVALID' });
    await expect(
      mutateWebsiteData(context, project.id, {
        action: 'upsert-collection',
        collectionKey: 'orders',
        confirmed: true,
        fields: [
          {
            key: 'customer',
            label: '客戶',
            options: [],
            referenceCollectionKey: 'missing-collection',
            required: true,
            type: 'reference',
          },
        ],
        name: '訂單',
      }),
    ).rejects.toMatchObject({ code: 'WEBSITE_INVALID' });
    await expect(
      mutateWebsiteData({ ...context, actor: { ...context.actor, role: 'viewer' } }, project.id, {
        action: 'create-record',
        collectionKey: 'bookings',
        idempotencyKey: crypto.randomUUID(),
        values: { email: 'member@example.com', name: '網站會員', seats: 2 },
      }),
    ).rejects.toMatchObject({ code: 'WEBSITE_FORBIDDEN' });
  });

  it('enforces a reviewed site role before accepting a protected form', async () => {
    const { createWebsiteProject } = await import('./website-studio-server');
    const { executeWebsiteSiteAuth, mutateWebsiteSiteAccess } =
      await import('./website-access-server');
    const { mutateWebsiteData, submitPublishedWebsiteDataForm } =
      await import('./website-data-server');
    const project = await createWebsiteProject(context, {
      name: `Protected data ${crypto.randomUUID()}`,
    });
    await mutateWebsiteSiteAccess(context, project.id, {
      action: 'save-matrix',
      confirmed: true,
      registrationEnabled: true,
      rules: [{ pageSlug: 'booking', requiredRole: null }],
    });
    await mutateWebsiteData(context, project.id, {
      action: 'upsert-collection',
      collectionKey: 'bookings',
      confirmed: true,
      fields: bookingFields,
      name: '預約',
    });
    await mutateWebsiteData(context, project.id, {
      action: 'upsert-form',
      active: true,
      collectionKey: 'bookings',
      confirmed: true,
      fieldKeys: ['name', 'email', 'seats'],
      formKey: 'member-booking',
      pageSlug: 'booking',
      requiredRole: 'member',
      submitLabel: '會員預約',
      successMessage: '會員預約已建立。',
      title: '會員預約',
      workflowTrigger: 'none',
    });
    const website = {
      projectId: project.id,
      publication: {
        id: crypto.randomUUID(),
        projectId: project.id,
        publicPath: '/s/protected-data',
        publishedAt: new Date().toISOString(),
        slug: 'protected-data',
        status: 'active' as const,
        version: 1,
      },
      tenantId: context.actor.tenantId,
    };
    const submission = {
      formKey: 'member-booking',
      idempotencyKey: crypto.randomUUID(),
      pageSlug: 'booking',
      values: { email: 'protected@example.com', name: '受保護會員', seats: 1 },
      website: '' as const,
    };
    await expect(submitPublishedWebsiteDataForm(website, submission)).rejects.toMatchObject({
      code: 'WEBSITE_FORBIDDEN',
    });
    const auth = await executeWebsiteSiteAuth(website, {
      action: 'register',
      confirmPassword: 'SiteMember123',
      displayName: 'Protected member',
      email: `protected-${crypto.randomUUID()}@example.com`,
      pageSlug: 'booking',
      password: 'SiteMember123',
    });
    expect(auth.mockSessionToken).toBeDefined();
    await expect(
      submitPublishedWebsiteDataForm(website, submission, auth.mockSessionToken),
    ).resolves.toMatchObject({
      message: '會員預約已建立。',
      record: { ownerSiteUserId: expect.any(String) },
    });
  });
});
