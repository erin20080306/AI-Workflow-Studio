import 'server-only';

import {
  WebsiteAdminDashboardSchema,
  WebsiteAdminMutationSchema,
  WebsiteCheckoutInputSchema,
  WebsiteContactSubmissionInputSchema,
  WebsiteContentEntrySchema,
  WebsiteFormSubmissionSchema,
  WebsiteOrderSchema,
  type WebsiteAdminDashboard,
  type WebsiteAdminMutation,
  type WebsiteCheckoutInput,
  type WebsiteContactSubmissionInput,
  type WebsiteContentEntry,
  type WebsiteFormSubmission,
  type WebsiteOrder,
  type WebsiteOrderItem,
  type WebsiteSpec,
} from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import type { PublishedWebsite } from '@/lib/website-publication-server';
import { getWebsiteSpecGeneration } from '@/lib/website-spec-server';
import { getWebsiteProject, WebsiteStudioError } from './website-studio-server';

const ContentRowSchema = z
  .object({
    body: z.string().min(1).max(8_000),
    content_key: z.string().min(2).max(80),
    created_at: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    page_slug: z.string().min(1).max(80),
    project_id: z.string().uuid(),
    status: z.enum(['draft', 'published']),
    tenant_id: z.string().uuid(),
    title: z.string().min(1).max(120),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();

const SubmissionRowSchema = z
  .object({
    created_at: z.string().datetime({ offset: true }),
    email: z.string().email(),
    form_key: z.literal('contact'),
    id: z.string().uuid(),
    message: z.string().min(10).max(2_000),
    name: z.string().min(1).max(120),
    page_slug: z.string().min(1).max(80),
    project_id: z.string().uuid(),
    status: z.enum(['new', 'read', 'archived']),
    subject: z.string().max(160),
    tenant_id: z.string().uuid(),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();

const OrderRowSchema = z
  .object({
    buyer_email: z.string().email(),
    buyer_name: z.string().min(1).max(120),
    created_at: z.string().datetime({ offset: true }),
    currency: z.string().max(8),
    id: z.string().uuid(),
    item_count: z.number().int().min(1),
    items: z.array(z.record(z.string(), z.unknown())),
    page_slug: z.string().min(1).max(80),
    project_id: z.string().uuid(),
    status: z.enum(['pending', 'paid', 'shipped', 'completed', 'cancelled']),
    subtotal: z.union([z.number(), z.string()]),
    tenant_id: z.string().uuid(),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();

interface MemoryWebsiteAdmin {
  readonly content: Map<string, WebsiteContentEntry>;
  readonly inventory: Map<string, number>;
  readonly orders: WebsiteOrder[];
  readonly submissions: WebsiteFormSubmission[];
}

const adminGlobal = globalThis as typeof globalThis & {
  __aiWorkflowWebsiteAdmin?: Map<string, MemoryWebsiteAdmin>;
};

function memoryAdmin(projectId: string): MemoryWebsiteAdmin {
  adminGlobal.__aiWorkflowWebsiteAdmin ??= new Map();
  const existing = adminGlobal.__aiWorkflowWebsiteAdmin.get(projectId);
  if (existing !== undefined) return existing;
  const created: MemoryWebsiteAdmin = {
    content: new Map(),
    inventory: new Map(),
    orders: [],
    submissions: [],
  };
  adminGlobal.__aiWorkflowWebsiteAdmin.set(projectId, created);
  return created;
}

/** Published stock per tracked SKU (products that declare both a SKU and stock). */
function specStockBySku(spec: WebsiteSpec): Map<string, number> {
  const stock = new Map<string, number>();
  for (const page of spec.pages) {
    for (const section of page.sections) {
      if (section.type !== 'product-grid') continue;
      for (const item of section.items) {
        if (item.sku !== undefined && item.stock !== undefined) stock.set(item.sku, item.stock);
      }
    }
  }
  return stock;
}

/** Reservation lines for the order's items that are stock-tracked in the spec. */
function orderStockLines(
  spec: WebsiteSpec,
  items: readonly WebsiteOrderItem[],
): { readonly quantity: number; readonly sku: string; readonly stock: number }[] {
  const stock = specStockBySku(spec);
  const lines: { quantity: number; sku: string; stock: number }[] = [];
  for (const item of items) {
    if (item.sku === undefined) continue;
    const limit = stock.get(item.sku);
    if (limit === undefined) continue;
    lines.push({ quantity: item.quantity, sku: item.sku, stock: limit });
  }
  return lines;
}

async function reserveOrderStock(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
  lines: readonly { readonly quantity: number; readonly sku: string; readonly stock: number }[],
): Promise<void> {
  if (lines.length === 0) return;
  if (getEnvironment().mockMode) {
    const memory = memoryAdmin(website.projectId);
    for (const line of lines) {
      const sold = memory.inventory.get(line.sku) ?? 0;
      if (sold + line.quantity > line.stock) {
        throw new WebsiteStudioError(
          'WEBSITE_INVALID',
          'A product in the order does not have enough stock.',
        );
      }
    }
    for (const line of lines) {
      memory.inventory.set(line.sku, (memory.inventory.get(line.sku) ?? 0) + line.quantity);
    }
    return;
  }
  const result = await createSupabaseAdminClient().rpc('website_reserve_order_stock', {
    p_lines: lines,
    p_project: website.projectId,
    p_tenant: website.tenantId,
  });
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_INVALID',
      'A product in the order does not have enough stock.',
    );
  }
}

/** Return reserved units to stock when an order is cancelled. */
async function restockOrder(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
  order: WebsiteOrder,
): Promise<void> {
  const lines = order.items.filter((item) => item.sku !== undefined);
  if (lines.length === 0) return;
  if (getEnvironment().mockMode) {
    const memory = memoryAdmin(website.projectId);
    for (const item of lines) {
      const next = Math.max(0, (memory.inventory.get(item.sku as string) ?? 0) - item.quantity);
      memory.inventory.set(item.sku as string, next);
    }
    return;
  }
  const admin = createSupabaseAdminClient();
  for (const item of lines) {
    await admin.rpc('website_release_order_stock', {
      p_project: website.projectId,
      p_qty: item.quantity,
      p_sku: item.sku,
      p_tenant: website.tenantId,
    });
  }
}

export async function getWebsiteInventorySold(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
): Promise<ReadonlyMap<string, number>> {
  if (getEnvironment().mockMode) {
    return new Map(memoryAdmin(website.projectId).inventory);
  }
  const result = await createSupabaseAdminClient()
    .from('website_inventory')
    .select('sku, sold')
    .eq('tenant_id', website.tenantId)
    .eq('project_id', website.projectId)
    .limit(1_000);
  const rows = z
    .array(z.object({ sku: z.string(), sold: z.number().int().min(0) }).strict())
    .safeParse(result.data);
  if (result.error !== null || !rows.success) return new Map();
  return new Map(rows.data.map((row) => [row.sku, row.sold]));
}

function orderView(rowValue: unknown): WebsiteOrder {
  const row = OrderRowSchema.parse(rowValue);
  return WebsiteOrderSchema.parse({
    buyerEmail: row.buyer_email,
    buyerName: row.buyer_name,
    createdAt: row.created_at,
    currency: row.currency,
    id: row.id,
    itemCount: row.item_count,
    items: row.items,
    pageSlug: row.page_slug,
    projectId: row.project_id,
    status: row.status,
    subtotal: typeof row.subtotal === 'string' ? Number(row.subtotal) : row.subtotal,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  });
}

/** Derive a leading currency symbol from a price label (e.g. "NT$1,680" → "NT$"). */
function currencySymbol(priceLabel: string): string {
  return priceLabel
    .replace(/[\d.,\s].*$/u, '')
    .trim()
    .slice(0, 8);
}

/**
 * Re-price an untrusted checkout against the published spec. Prices, currency,
 * and availability always come from the server-side spec, never the browser.
 */
function priceCheckout(
  spec: WebsiteSpec,
  input: WebsiteCheckoutInput,
): {
  readonly currency: string;
  readonly itemCount: number;
  readonly items: readonly WebsiteOrderItem[];
} {
  const products = spec.pages
    .flatMap((page) => page.sections)
    .filter((section) => section.type === 'product-grid')
    .flatMap((section) => (section.type === 'product-grid' ? section.items : []));
  const items = input.items.map((line) => {
    const product =
      products.find((candidate) => candidate.sku !== undefined && candidate.sku === line.id) ??
      products.find((candidate) => candidate.name === line.name);
    if (product === undefined) {
      throw new WebsiteStudioError(
        'WEBSITE_INVALID',
        'A product in the order is no longer available.',
      );
    }
    if (product.stock !== undefined && (product.stock === 0 || line.quantity > product.stock)) {
      throw new WebsiteStudioError(
        'WEBSITE_INVALID',
        'A product in the order does not have enough stock.',
      );
    }
    const unitPrice = product.price ?? 0;
    const currency = product.currency ?? currencySymbol(product.priceLabel);
    return {
      currency,
      lineTotal: Math.min(unitPrice * line.quantity, 1_000_000_000_000),
      name: product.name,
      quantity: line.quantity,
      ...(product.sku === undefined ? {} : { sku: product.sku }),
      unitPrice,
    } satisfies WebsiteOrderItem;
  });
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  return { currency: items[0]?.currency ?? '', itemCount, items };
}

function contentView(rowValue: unknown): WebsiteContentEntry {
  const row = ContentRowSchema.parse(rowValue);
  return WebsiteContentEntrySchema.parse({
    body: row.body,
    contentKey: row.content_key,
    createdAt: row.created_at,
    id: row.id,
    pageSlug: row.page_slug,
    projectId: row.project_id,
    status: row.status,
    tenantId: row.tenant_id,
    title: row.title,
    updatedAt: row.updated_at,
  });
}

function submissionView(rowValue: unknown): WebsiteFormSubmission {
  const row = SubmissionRowSchema.parse(rowValue);
  return WebsiteFormSubmissionSchema.parse({
    createdAt: row.created_at,
    email: row.email,
    formKey: row.form_key,
    id: row.id,
    message: row.message,
    name: row.name,
    pageSlug: row.page_slug,
    projectId: row.project_id,
    status: row.status,
    subject: row.subject,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  });
}

function assertCanManage(context: WorkspaceContext): void {
  if (context.actor.role === 'viewer') {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'Viewer access cannot change the website backend.',
    );
  }
}

async function assertKnownPage(
  context: WorkspaceContext,
  projectId: string,
  pageSlug: string,
): Promise<void> {
  const generation = await getWebsiteSpecGeneration(context, projectId);
  if (generation === undefined || !generation.spec.pages.some((page) => page.slug === pageSlug)) {
    throw new WebsiteStudioError(
      'WEBSITE_INVALID',
      'Website content must target a page in the current validated Canvas.',
    );
  }
}

async function recordStatusAudit(
  context: WorkspaceContext,
  projectId: string,
  submissionId: string,
  status: WebsiteFormSubmission['status'],
): Promise<void> {
  if (getEnvironment().mockMode) return;
  const result = await createSupabaseAdminClient().from('audit_logs').insert({
    action: 'website_form.status_updated',
    actor_user_id: context.actor.userId,
    correlation_id: projectId,
    metadata: { status },
    resource_id: submissionId,
    resource_type: 'website_form_submission',
    tenant_id: context.actor.tenantId,
  });
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The form submission audit event could not be recorded.',
    );
  }
}

export async function getWebsiteAdminDashboard(
  context: WorkspaceContext,
  projectId: string,
): Promise<WebsiteAdminDashboard> {
  const project = await getWebsiteProject(context, projectId);
  if (getEnvironment().mockMode) {
    const memory = memoryAdmin(project.id);
    return WebsiteAdminDashboardSchema.parse({
      contentEntries: [...memory.content.values()].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
      orders: [...memory.orders]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 200),
      submissions: [...memory.submissions]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 200),
    });
  }
  const admin = createSupabaseAdminClient();
  const [contentResult, submissionsResult, ordersResult] = await Promise.all([
    admin
      .from('website_content_entries')
      .select(
        'body, content_key, created_at, id, page_slug, project_id, status, tenant_id, title, updated_at',
      )
      .eq('tenant_id', context.actor.tenantId)
      .eq('project_id', project.id)
      .order('updated_at', { ascending: false })
      .limit(50),
    admin
      .from('website_form_submissions')
      .select(
        'created_at, email, form_key, id, message, name, page_slug, project_id, status, subject, tenant_id, updated_at',
      )
      .eq('tenant_id', context.actor.tenantId)
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('website_storefront_orders')
      .select(
        'buyer_email, buyer_name, created_at, currency, id, item_count, items, page_slug, project_id, status, subtotal, tenant_id, updated_at',
      )
      .eq('tenant_id', context.actor.tenantId)
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  const contentRows = z.array(ContentRowSchema).safeParse(contentResult.data);
  const submissionRows = z.array(SubmissionRowSchema).safeParse(submissionsResult.data);
  const orderRows = z.array(OrderRowSchema).safeParse(ordersResult.data);
  if (
    contentResult.error !== null ||
    submissionsResult.error !== null ||
    ordersResult.error !== null ||
    !contentRows.success ||
    !submissionRows.success ||
    !orderRows.success
  ) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website backend could not be loaded.',
    );
  }
  return WebsiteAdminDashboardSchema.parse({
    contentEntries: contentRows.data.map(contentView),
    orders: orderRows.data.map(orderView),
    submissions: submissionRows.data.map(submissionView),
  });
}

export async function mutateWebsiteAdmin(
  context: WorkspaceContext,
  projectId: string,
  mutationValue: WebsiteAdminMutation,
): Promise<WebsiteAdminDashboard> {
  assertCanManage(context);
  const mutation = WebsiteAdminMutationSchema.parse(mutationValue);
  const project = await getWebsiteProject(context, projectId);
  if (mutation.action === 'upsert-content') {
    await assertKnownPage(context, project.id, mutation.pageSlug);
    if (getEnvironment().mockMode) {
      const memory = memoryAdmin(project.id);
      const existing = memory.content.get(mutation.contentKey);
      const now = new Date().toISOString();
      memory.content.set(
        mutation.contentKey,
        WebsiteContentEntrySchema.parse({
          body: mutation.body,
          contentKey: mutation.contentKey,
          createdAt: existing?.createdAt ?? now,
          id: existing?.id ?? crypto.randomUUID(),
          pageSlug: mutation.pageSlug,
          projectId: project.id,
          status: mutation.status,
          tenantId: context.actor.tenantId,
          title: mutation.title,
          updatedAt: now,
        }),
      );
      return getWebsiteAdminDashboard(context, project.id);
    }
    const admin = createSupabaseAdminClient();
    const existing = await admin
      .from('website_content_entries')
      .select('id')
      .eq('tenant_id', context.actor.tenantId)
      .eq('project_id', project.id)
      .eq('content_key', mutation.contentKey)
      .maybeSingle();
    if (existing.error !== null) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The managed website content could not be saved.',
      );
    }
    const attributes = {
      body: mutation.body,
      page_slug: mutation.pageSlug,
      status: mutation.status,
      title: mutation.title,
      updated_by: context.actor.userId,
    };
    const result =
      existing.data === null
        ? await admin.from('website_content_entries').insert({
            ...attributes,
            content_key: mutation.contentKey,
            created_by: context.actor.userId,
            project_id: project.id,
            tenant_id: context.actor.tenantId,
          })
        : await admin
            .from('website_content_entries')
            .update(attributes)
            .eq('tenant_id', context.actor.tenantId)
            .eq('project_id', project.id)
            .eq('id', existing.data.id);
    if (result.error !== null) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The managed website content could not be saved.',
      );
    }
  } else if (mutation.action === 'update-order-status') {
    const scope = { projectId: project.id, tenantId: context.actor.tenantId };
    if (getEnvironment().mockMode) {
      const memory = memoryAdmin(project.id);
      const index = memory.orders.findIndex((order) => order.id === mutation.orderId);
      const existing = memory.orders[index];
      if (existing === undefined) {
        throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The website order was not found.');
      }
      memory.orders[index] = WebsiteOrderSchema.parse({
        ...existing,
        status: mutation.status,
        updatedAt: new Date().toISOString(),
      });
      if (mutation.status === 'cancelled' && existing.status !== 'cancelled') {
        await restockOrder(scope, existing);
      }
    } else {
      const admin = createSupabaseAdminClient();
      const current = await admin
        .from('website_storefront_orders')
        .select(ORDER_SELECT)
        .eq('tenant_id', context.actor.tenantId)
        .eq('project_id', project.id)
        .eq('id', mutation.orderId)
        .maybeSingle();
      if (current.error !== null || current.data === null) {
        throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The website order was not found.');
      }
      const previous = orderView(current.data);
      const result = await admin
        .from('website_storefront_orders')
        .update({ status: mutation.status })
        .eq('tenant_id', context.actor.tenantId)
        .eq('project_id', project.id)
        .eq('id', mutation.orderId)
        .select('id')
        .maybeSingle();
      if (result.error !== null || result.data === null) {
        throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The website order was not found.');
      }
      if (mutation.status === 'cancelled' && previous.status !== 'cancelled') {
        await restockOrder(scope, previous);
      }
    }
  } else if (mutation.action === 'reset-inventory') {
    if (getEnvironment().mockMode) {
      memoryAdmin(project.id).inventory.clear();
    } else {
      const result = await createSupabaseAdminClient()
        .from('website_inventory')
        .delete()
        .eq('tenant_id', context.actor.tenantId)
        .eq('project_id', project.id);
      if (result.error !== null) {
        throw new WebsiteStudioError('WEBSITE_STATE_CONFLICT', 'The inventory could not be reset.');
      }
    }
  } else {
    if (getEnvironment().mockMode) {
      const memory = memoryAdmin(project.id);
      const index = memory.submissions.findIndex(
        (submission) => submission.id === mutation.submissionId,
      );
      const existing = memory.submissions[index];
      if (existing === undefined) {
        throw new WebsiteStudioError(
          'WEBSITE_NOT_FOUND',
          'The website form submission was not found.',
        );
      }
      memory.submissions[index] = WebsiteFormSubmissionSchema.parse({
        ...existing,
        status: mutation.status,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const result = await createSupabaseAdminClient()
        .from('website_form_submissions')
        .update({ status: mutation.status })
        .eq('tenant_id', context.actor.tenantId)
        .eq('project_id', project.id)
        .eq('id', mutation.submissionId)
        .select('id')
        .maybeSingle();
      if (result.error !== null || result.data === null) {
        throw new WebsiteStudioError(
          'WEBSITE_NOT_FOUND',
          'The website form submission was not found.',
        );
      }
      await recordStatusAudit(context, project.id, mutation.submissionId, mutation.status);
    }
  }
  return getWebsiteAdminDashboard(context, project.id);
}

export async function listPublishedWebsiteContent(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
  pageSlug: string,
): Promise<readonly WebsiteContentEntry[]> {
  if (getEnvironment().mockMode) {
    return [...memoryAdmin(website.projectId).content.values()]
      .filter((entry) => entry.status === 'published' && entry.pageSlug === pageSlug)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
  const result = await createSupabaseAdminClient()
    .from('website_content_entries')
    .select(
      'body, content_key, created_at, id, page_slug, project_id, status, tenant_id, title, updated_at',
    )
    .eq('tenant_id', website.tenantId)
    .eq('project_id', website.projectId)
    .eq('page_slug', pageSlug)
    .eq('status', 'published')
    .order('created_at', { ascending: true })
    .limit(50);
  const rows = z.array(ContentRowSchema).safeParse(result.data);
  if (result.error !== null || !rows.success) return [];
  return rows.data.map(contentView);
}

export async function createWebsiteContactSubmission(
  website: Pick<PublishedWebsite, 'projectId' | 'spec' | 'tenantId'>,
  inputValue: WebsiteContactSubmissionInput,
): Promise<WebsiteFormSubmission> {
  const input = WebsiteContactSubmissionInputSchema.parse(inputValue);
  if (!website.spec.pages.some((page) => page.slug === input.pageSlug)) {
    throw new WebsiteStudioError('WEBSITE_INVALID', 'The contact form page is invalid.');
  }
  const email = input.email.toLowerCase();
  if (getEnvironment().mockMode) {
    const memory = memoryAdmin(website.projectId);
    const cutoff = Date.now() - 10 * 60 * 1_000;
    const recent = memory.submissions.filter(
      (submission) =>
        submission.email === email && new Date(submission.createdAt).getTime() >= cutoff,
    );
    if (recent.length >= 5) {
      throw new WebsiteStudioError(
        'WEBSITE_RATE_LIMITED',
        'Please wait before sending another message.',
      );
    }
    const now = new Date().toISOString();
    const submission = WebsiteFormSubmissionSchema.parse({
      createdAt: now,
      email,
      formKey: 'contact',
      id: crypto.randomUUID(),
      message: input.message,
      name: input.name,
      pageSlug: input.pageSlug,
      projectId: website.projectId,
      status: 'new',
      subject: input.subject,
      tenantId: website.tenantId,
      updatedAt: now,
    });
    memory.submissions.push(submission);
    return submission;
  }
  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 10 * 60 * 1_000).toISOString();
  const recent = await admin
    .from('website_form_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', website.tenantId)
    .eq('project_id', website.projectId)
    .eq('email', email)
    .gte('created_at', cutoff);
  if (recent.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The contact request could not be checked safely.',
    );
  }
  if ((recent.count ?? 0) >= 5) {
    throw new WebsiteStudioError(
      'WEBSITE_RATE_LIMITED',
      'Please wait before sending another message.',
    );
  }
  const result = await admin
    .from('website_form_submissions')
    .insert({
      email,
      message: input.message,
      name: input.name,
      page_slug: input.pageSlug,
      project_id: website.projectId,
      subject: input.subject,
      tenant_id: website.tenantId,
    })
    .select(
      'created_at, email, form_key, id, message, name, page_slug, project_id, status, subject, tenant_id, updated_at',
    )
    .single();
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The contact message could not be saved.',
    );
  }
  return submissionView(result.data);
}

const ORDER_SELECT =
  'buyer_email, buyer_name, created_at, currency, id, item_count, items, page_slug, project_id, status, subtotal, tenant_id, updated_at';

export async function createWebsiteOrder(
  website: Pick<PublishedWebsite, 'projectId' | 'spec' | 'tenantId'>,
  inputValue: WebsiteCheckoutInput,
): Promise<WebsiteOrder> {
  const input = WebsiteCheckoutInputSchema.parse(inputValue);
  if (!website.spec.pages.some((page) => page.slug === input.pageSlug)) {
    throw new WebsiteStudioError('WEBSITE_INVALID', 'The checkout page is invalid.');
  }
  const email = input.email.toLowerCase();
  const priced = priceCheckout(website.spec, input);
  const subtotal = Math.min(
    priced.items.reduce((sum, item) => sum + item.lineTotal, 0),
    1_000_000_000_000,
  );
  // Reserve live stock atomically before recording the order; a shortfall here
  // rejects the whole checkout so the storefront never oversells.
  await reserveOrderStock(website, orderStockLines(website.spec, priced.items));
  if (getEnvironment().mockMode) {
    const memory = memoryAdmin(website.projectId);
    const cutoff = Date.now() - 10 * 60 * 1_000;
    const recent = memory.orders.filter(
      (order) => order.buyerEmail === email && new Date(order.createdAt).getTime() >= cutoff,
    );
    if (recent.length >= 5) {
      throw new WebsiteStudioError(
        'WEBSITE_RATE_LIMITED',
        'Please wait before placing another order.',
      );
    }
    const now = new Date().toISOString();
    const order = WebsiteOrderSchema.parse({
      buyerEmail: email,
      buyerName: input.name,
      createdAt: now,
      currency: priced.currency,
      id: crypto.randomUUID(),
      itemCount: priced.itemCount,
      items: priced.items,
      pageSlug: input.pageSlug,
      projectId: website.projectId,
      status: 'pending',
      subtotal,
      tenantId: website.tenantId,
      updatedAt: now,
    });
    memory.orders.push(order);
    return order;
  }
  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 10 * 60 * 1_000).toISOString();
  const recent = await admin
    .from('website_storefront_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', website.tenantId)
    .eq('project_id', website.projectId)
    .eq('buyer_email', email)
    .gte('created_at', cutoff);
  if (recent.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The order could not be checked safely.',
    );
  }
  if ((recent.count ?? 0) >= 5) {
    throw new WebsiteStudioError(
      'WEBSITE_RATE_LIMITED',
      'Please wait before placing another order.',
    );
  }
  const result = await admin
    .from('website_storefront_orders')
    .insert({
      buyer_email: email,
      buyer_name: input.name,
      currency: priced.currency,
      item_count: priced.itemCount,
      items: priced.items,
      page_slug: input.pageSlug,
      project_id: website.projectId,
      subtotal,
      tenant_id: website.tenantId,
    })
    .select(ORDER_SELECT)
    .single();
  if (result.error !== null) {
    throw new WebsiteStudioError('WEBSITE_STATE_CONFLICT', 'The order could not be saved.');
  }
  return orderView(result.data);
}
