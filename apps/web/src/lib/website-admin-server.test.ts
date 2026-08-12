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

const commerceSpec = WebsiteSpecSchema.parse({
  ...spec,
  pages: [
    {
      metaDescription: 'A storefront fixture with a product grid for orders.',
      sections: [
        {
          columns: '2',
          id: 'products-main',
          items: [
            {
              currency: 'NT$',
              name: '有現貨商品',
              price: 1000,
              priceLabel: 'NT$1,000',
              sku: 'OK-1',
              stock: 5,
            },
            {
              currency: 'NT$',
              name: '售完商品',
              price: 800,
              priceLabel: 'NT$800',
              sku: 'OUT-1',
              stock: 0,
            },
          ],
          title: '本週選品',
          type: 'product-grid',
        },
      ],
      slug: 'home',
      title: '首頁',
    },
  ],
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

  it('captures a re-priced storefront order and advances its fulfillment status', async () => {
    const { createWebsiteProject } = await import('./website-studio-server');
    const { createWebsiteOrder, getWebsiteAdminDashboard, mutateWebsiteAdmin } =
      await import('./website-admin-server');
    const project = await createWebsiteProject(context, { name: `Store ${crypto.randomUUID()}` });
    const website = { projectId: project.id, spec: commerceSpec, tenantId: context.actor.tenantId };

    const order = await createWebsiteOrder(website, {
      email: 'Buyer@Example.com',
      // Only id/name/quantity are trusted; the server re-prices from the spec.
      items: [{ id: 'OK-1', name: '有現貨商品', quantity: 2 }],
      name: '購買者',
      pageSlug: 'home',
    });
    expect(order).toMatchObject({
      buyerEmail: 'buyer@example.com',
      currency: 'NT$',
      itemCount: 2,
      status: 'pending',
      subtotal: 2000,
    });
    expect(order.items[0]).toMatchObject({ lineTotal: 2000, sku: 'OK-1', unitPrice: 1000 });

    const afterStatus = await mutateWebsiteAdmin(context, project.id, {
      action: 'update-order-status',
      orderId: order.id,
      status: 'shipped',
    });
    expect(afterStatus.orders).toEqual([
      expect.objectContaining({ id: order.id, status: 'shipped' }),
    ]);
    expect(await getWebsiteAdminDashboard(context, project.id)).toEqual(afterStatus);
  });

  it('deducts live stock on checkout, restocks on cancel, and resets on demand', async () => {
    const { createWebsiteProject } = await import('./website-studio-server');
    const { createWebsiteOrder, getWebsiteInventorySold, mutateWebsiteAdmin } =
      await import('./website-admin-server');
    const project = await createWebsiteProject(context, { name: `Store ${crypto.randomUUID()}` });
    const website = { projectId: project.id, spec: commerceSpec, tenantId: context.actor.tenantId };
    const line = (quantity: number) => ({
      email: 'buyer@example.com',
      items: [{ id: 'OK-1', name: '有現貨商品', quantity }],
      name: '購買者',
      pageSlug: 'home',
    });

    const first = await createWebsiteOrder(website, line(4));
    expect((await getWebsiteInventorySold(website)).get('OK-1')).toBe(4);
    // Only 1 of 5 remains, so a further order of 2 must be rejected.
    await expect(createWebsiteOrder(website, line(2))).rejects.toMatchObject({
      code: 'WEBSITE_INVALID',
    });

    // Cancelling the first order returns its units to stock.
    await mutateWebsiteAdmin(context, project.id, {
      action: 'update-order-status',
      orderId: first.id,
      status: 'cancelled',
    });
    expect((await getWebsiteInventorySold(website)).get('OK-1')).toBe(0);
    const second = await createWebsiteOrder(website, line(5));
    expect(second.itemCount).toBe(5);
    expect((await getWebsiteInventorySold(website)).get('OK-1')).toBe(5);

    // Resetting inventory clears the sold counters back to the published level.
    await mutateWebsiteAdmin(context, project.id, { action: 'reset-inventory' });
    expect((await getWebsiteInventorySold(website)).get('OK-1')).toBeUndefined();
  });

  it('rejects a checkout for a sold-out product or a quantity above stock', async () => {
    const { createWebsiteProject } = await import('./website-studio-server');
    const { createWebsiteOrder } = await import('./website-admin-server');
    const project = await createWebsiteProject(context, { name: `Store ${crypto.randomUUID()}` });
    const website = { projectId: project.id, spec: commerceSpec, tenantId: context.actor.tenantId };

    await expect(
      createWebsiteOrder(website, {
        email: 'buyer@example.com',
        items: [{ id: 'OUT-1', name: '售完商品', quantity: 1 }],
        name: '購買者',
        pageSlug: 'home',
      }),
    ).rejects.toMatchObject({ code: 'WEBSITE_INVALID' });

    await expect(
      createWebsiteOrder(website, {
        email: 'buyer@example.com',
        items: [{ id: 'OK-1', name: '有現貨商品', quantity: 99 }],
        name: '購買者',
        pageSlug: 'home',
      }),
    ).rejects.toMatchObject({ code: 'WEBSITE_INVALID' });
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
