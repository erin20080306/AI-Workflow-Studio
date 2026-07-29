import 'server-only';

import {
  WebsiteAdminDashboardSchema,
  WebsiteAdminMutationSchema,
  WebsiteContactSubmissionInputSchema,
  WebsiteContentEntrySchema,
  WebsiteFormSubmissionSchema,
  type WebsiteAdminDashboard,
  type WebsiteAdminMutation,
  type WebsiteContactSubmissionInput,
  type WebsiteContentEntry,
  type WebsiteFormSubmission,
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

interface MemoryWebsiteAdmin {
  readonly content: Map<string, WebsiteContentEntry>;
  readonly submissions: WebsiteFormSubmission[];
}

const adminGlobal = globalThis as typeof globalThis & {
  __aiWorkflowWebsiteAdmin?: Map<string, MemoryWebsiteAdmin>;
};

function memoryAdmin(projectId: string): MemoryWebsiteAdmin {
  adminGlobal.__aiWorkflowWebsiteAdmin ??= new Map();
  const existing = adminGlobal.__aiWorkflowWebsiteAdmin.get(projectId);
  if (existing !== undefined) return existing;
  const created: MemoryWebsiteAdmin = { content: new Map(), submissions: [] };
  adminGlobal.__aiWorkflowWebsiteAdmin.set(projectId, created);
  return created;
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
      submissions: [...memory.submissions]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 200),
    });
  }
  const admin = createSupabaseAdminClient();
  const [contentResult, submissionsResult] = await Promise.all([
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
  ]);
  const contentRows = z.array(ContentRowSchema).safeParse(contentResult.data);
  const submissionRows = z.array(SubmissionRowSchema).safeParse(submissionsResult.data);
  if (
    contentResult.error !== null ||
    submissionsResult.error !== null ||
    !contentRows.success ||
    !submissionRows.success
  ) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website backend could not be loaded.',
    );
  }
  return WebsiteAdminDashboardSchema.parse({
    contentEntries: contentRows.data.map(contentView),
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
