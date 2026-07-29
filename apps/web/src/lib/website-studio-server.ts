import 'server-only';

import {
  WebsiteBriefDraftSchema,
  WebsiteBriefPatchSchema,
  WebsiteProjectCreateInputSchema,
  WebsiteProjectSchema,
  completeWebsiteBrief,
  websiteBriefProgress,
  type WebsiteBriefDraft,
  type WebsiteBriefPatch,
  type WebsiteProject,
  type WebsiteProjectCreateInput,
} from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const WebsiteProjectRowSchema = z.object({
  brief: z.unknown(),
  brief_completed_at: z.string().datetime({ offset: true }).nullable(),
  brief_progress: z.number().int().min(0).max(6),
  created_at: z.string().datetime({ offset: true }),
  created_by: z.string().uuid(),
  draft_created_at: z.string().datetime({ offset: true }).nullable(),
  id: z.string().uuid(),
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80),
  status: z.enum(['briefing', 'draft', 'archived']),
  tenant_id: z.string().uuid(),
  updated_at: z.string().datetime({ offset: true }),
});

export type WebsiteStudioErrorCode =
  | 'WEBSITE_FORBIDDEN'
  | 'WEBSITE_INVALID'
  | 'WEBSITE_NOT_FOUND'
  | 'WEBSITE_PROVIDER_UNAVAILABLE'
  | 'WEBSITE_RATE_LIMITED'
  | 'WEBSITE_STATE_CONFLICT';

export class WebsiteStudioError extends Error {
  readonly code: WebsiteStudioErrorCode;

  constructor(code: WebsiteStudioErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'WebsiteStudioError';
  }
}

interface MemoryWebsiteProject {
  brief: WebsiteBriefDraft;
  briefCompletedAt?: string;
  readonly createdAt: string;
  readonly createdBy: string;
  draftCreatedAt?: string;
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  status: 'briefing' | 'draft' | 'archived';
  readonly tenantId: string;
  updatedAt: string;
}

const websiteGlobal = globalThis as typeof globalThis & {
  __aiWorkflowWebsiteProjects?: Map<string, MemoryWebsiteProject>;
};

function memoryProjects(): Map<string, MemoryWebsiteProject> {
  websiteGlobal.__aiWorkflowWebsiteProjects ??= new Map();
  return websiteGlobal.__aiWorkflowWebsiteProjects;
}

function assertCanMutate(context: WorkspaceContext): void {
  if (context.actor.role === 'viewer') {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'Viewer access cannot change website projects.',
    );
  }
}

function projectView(
  value:
    | z.infer<typeof WebsiteProjectRowSchema>
    | {
        brief: WebsiteBriefDraft;
        briefCompletedAt?: string;
        createdAt: string;
        createdBy: string;
        draftCreatedAt?: string;
        id: string;
        name: string;
        slug: string;
        status: 'briefing' | 'draft' | 'archived';
        tenantId: string;
        updatedAt: string;
      },
): WebsiteProject {
  if ('tenant_id' in value) {
    const row = WebsiteProjectRowSchema.parse(value);
    const brief = WebsiteBriefDraftSchema.parse(row.brief);
    const progress = websiteBriefProgress(brief);
    if (progress.completedSteps !== row.brief_progress) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The saved website brief progress is inconsistent.',
      );
    }
    return WebsiteProjectSchema.parse({
      brief,
      ...(row.brief_completed_at === null ? {} : { briefCompletedAt: row.brief_completed_at }),
      completedSteps: progress.completedSteps,
      createdAt: row.created_at,
      createdBy: row.created_by,
      ...(row.draft_created_at === null ? {} : { draftCreatedAt: row.draft_created_at }),
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at,
    });
  }
  const progress = websiteBriefProgress(value.brief);
  return WebsiteProjectSchema.parse({
    ...value,
    completedSteps: progress.completedSteps,
  });
}

function memoryProject(context: WorkspaceContext, projectId: string): MemoryWebsiteProject {
  const project = memoryProjects().get(projectId);
  if (project === undefined || project.tenantId !== context.actor.tenantId) {
    throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The website project was not found.');
  }
  return project;
}

function slugBase(value: string): string {
  const ascii = value
    .normalize('NFKD')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 60)
    .replaceAll(/-+$/g, '');
  return ascii.length >= 2 ? ascii : `site-${crypto.randomUUID().slice(0, 8)}`;
}

async function uniqueSlug(context: WorkspaceContext, name: string): Promise<string> {
  const base = slugBase(name);
  if (getEnvironment().mockMode) {
    const used = [...memoryProjects().values()].some(
      (project) => project.tenantId === context.actor.tenantId && project.slug === base,
    );
    return used ? `${base}-${crypto.randomUUID().slice(0, 8)}` : base;
  }
  const existing = await createSupabaseAdminClient()
    .from('website_projects')
    .select('id')
    .eq('tenant_id', context.actor.tenantId)
    .eq('slug', base)
    .maybeSingle();
  if (existing.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website project name could not be checked.',
    );
  }
  return existing.data === null ? base : `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function recordAudit(
  context: WorkspaceContext,
  input: {
    readonly action: string;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly projectId: string;
  },
): Promise<void> {
  if (getEnvironment().mockMode) return;
  const result = await createSupabaseAdminClient().from('audit_logs').insert({
    action: input.action,
    actor_user_id: context.actor.userId,
    correlation_id: input.projectId,
    metadata: input.metadata,
    resource_id: input.projectId,
    resource_type: 'website_project',
    tenant_id: context.actor.tenantId,
  });
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website project audit event could not be recorded.',
    );
  }
}

export async function listWebsiteProjects(
  context: WorkspaceContext,
): Promise<readonly WebsiteProject[]> {
  if (getEnvironment().mockMode) {
    return [...memoryProjects().values()]
      .filter((project) => project.tenantId === context.actor.tenantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(projectView);
  }
  const result = await createSupabaseAdminClient()
    .from('website_projects')
    .select('*')
    .eq('tenant_id', context.actor.tenantId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(100);
  const rows = z.array(WebsiteProjectRowSchema).safeParse(result.data);
  if (result.error !== null || !rows.success) {
    throw new WebsiteStudioError('WEBSITE_STATE_CONFLICT', 'Website projects could not be loaded.');
  }
  return rows.data.map(projectView);
}

export async function getWebsiteProject(
  context: WorkspaceContext,
  projectId: string,
): Promise<WebsiteProject> {
  const id = z.string().uuid().parse(projectId);
  if (getEnvironment().mockMode) {
    return projectView(memoryProject(context, id));
  }
  const result = await createSupabaseAdminClient()
    .from('website_projects')
    .select('*')
    .eq('tenant_id', context.actor.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website project could not be loaded.',
    );
  }
  if (result.data === null) {
    throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The website project was not found.');
  }
  return projectView(WebsiteProjectRowSchema.parse(result.data));
}

export async function createWebsiteProject(
  context: WorkspaceContext,
  inputValue: WebsiteProjectCreateInput,
): Promise<WebsiteProject> {
  assertCanMutate(context);
  const input = WebsiteProjectCreateInputSchema.parse(inputValue);
  const slug = await uniqueSlug(context, input.name);
  if (getEnvironment().mockMode) {
    const now = new Date().toISOString();
    const project: MemoryWebsiteProject = {
      brief: WebsiteBriefDraftSchema.parse({}),
      createdAt: now,
      createdBy: context.actor.userId,
      id: crypto.randomUUID(),
      name: input.name,
      slug,
      status: 'briefing',
      tenantId: context.actor.tenantId,
      updatedAt: now,
    };
    memoryProjects().set(project.id, project);
    return projectView(project);
  }
  const result = await createSupabaseAdminClient()
    .from('website_projects')
    .insert({
      brief: WebsiteBriefDraftSchema.parse({}),
      created_by: context.actor.userId,
      name: input.name,
      slug,
      tenant_id: context.actor.tenantId,
    })
    .select('*')
    .single();
  const row = WebsiteProjectRowSchema.safeParse(result.data);
  if (result.error !== null || !row.success) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website project could not be created.',
    );
  }
  await recordAudit(context, {
    action: 'website_project.created',
    metadata: { status: 'briefing' },
    projectId: row.data.id,
  });
  return projectView(row.data);
}

export async function updateWebsiteBrief(
  context: WorkspaceContext,
  projectId: string,
  patchValue: WebsiteBriefPatch,
): Promise<WebsiteProject> {
  assertCanMutate(context);
  const patch = WebsiteBriefPatchSchema.parse(patchValue);
  const existing = await getWebsiteProject(context, projectId);
  if (existing.status !== 'briefing') {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'A created website draft is locked until versioned editing is available.',
    );
  }
  const brief = WebsiteBriefDraftSchema.parse({ ...existing.brief, ...patch });
  const progress = websiteBriefProgress(brief);
  const now = new Date().toISOString();
  if (getEnvironment().mockMode) {
    const project = memoryProject(context, existing.id);
    project.brief = brief;
    project.updatedAt = now;
    if (progress.complete) {
      project.briefCompletedAt ??= now;
    } else {
      delete project.briefCompletedAt;
    }
    return projectView(project);
  }
  const result = await createSupabaseAdminClient()
    .from('website_projects')
    .update({
      brief,
      brief_completed_at: progress.complete ? (existing.briefCompletedAt ?? now) : null,
      brief_progress: progress.completedSteps,
    })
    .eq('tenant_id', context.actor.tenantId)
    .eq('id', existing.id)
    .eq('status', 'briefing')
    .select('*')
    .maybeSingle();
  if (result.error !== null || result.data === null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website brief could not be updated.',
    );
  }
  const row = WebsiteProjectRowSchema.parse(result.data);
  await recordAudit(context, {
    action: 'website_project.brief_updated',
    metadata: {
      completedSteps: progress.completedSteps,
      updatedFields: Object.keys(patch).sort(),
    },
    projectId: existing.id,
  });
  return projectView(row);
}

export async function createWebsiteDraft(
  context: WorkspaceContext,
  projectId: string,
): Promise<WebsiteProject> {
  assertCanMutate(context);
  const existing = await getWebsiteProject(context, projectId);
  if (existing.status === 'draft') return existing;
  if (existing.status !== 'briefing') {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website project cannot create a draft in its current state.',
    );
  }
  completeWebsiteBrief(existing.brief);
  const now = new Date().toISOString();
  if (getEnvironment().mockMode) {
    const project = memoryProject(context, existing.id);
    project.status = 'draft';
    project.briefCompletedAt ??= now;
    project.draftCreatedAt = now;
    project.updatedAt = now;
    return projectView(project);
  }
  const result = await createSupabaseAdminClient()
    .from('website_projects')
    .update({
      brief_completed_at: existing.briefCompletedAt ?? now,
      brief_progress: 6,
      draft_created_at: now,
      status: 'draft',
    })
    .eq('tenant_id', context.actor.tenantId)
    .eq('id', existing.id)
    .eq('status', 'briefing')
    .select('*')
    .maybeSingle();
  if (result.error !== null || result.data === null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The validated website draft could not be created.',
    );
  }
  const row = WebsiteProjectRowSchema.parse(result.data);
  await recordAudit(context, {
    action: 'website_project.draft_created',
    metadata: {
      briefVersion: 1,
      completedSteps: 6,
      publishRequiresConfirmation: true,
    },
    projectId: existing.id,
  });
  return projectView(row);
}
