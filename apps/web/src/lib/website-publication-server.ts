import 'server-only';

import {
  WebsitePublicationSchema,
  WebsitePublishInputSchema,
  WebsiteSpecSchema,
  type WebsitePublication,
  type WebsitePublishInput,
  type WebsiteSpec,
} from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { normalizeCustomerHostname } from '@/lib/website-custom-domain';
import { getWebsiteSpecVersion } from '@/lib/website-spec-server';
import { getWebsiteProject, WebsiteStudioError } from '@/lib/website-studio-server';

const WebsitePublicationRowSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    published_at: z.string().datetime({ offset: true }),
    slug: z
      .string()
      .min(3)
      .max(96)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    spec_version: z.number().int().min(1),
    status: z.enum(['active', 'superseded']),
    superseded_at: z.string().datetime({ offset: true }).nullable(),
    tenant_id: z.string().uuid(),
  })
  .strict();

interface MemoryPublication extends WebsitePublication {
  readonly spec: WebsiteSpec;
  readonly tenantId: string;
}

const publicationGlobal = globalThis as typeof globalThis & {
  __aiWorkflowWebsitePublications?: Map<string, MemoryPublication[]>;
};

function memoryPublications(): Map<string, MemoryPublication[]> {
  publicationGlobal.__aiWorkflowWebsitePublications ??= new Map();
  return publicationGlobal.__aiWorkflowWebsitePublications;
}

function publicationView(row: z.infer<typeof WebsitePublicationRowSchema>): WebsitePublication {
  return WebsitePublicationSchema.parse({
    id: row.id,
    projectId: row.project_id,
    publicPath: `/s/${row.slug}`,
    publishedAt: row.published_at,
    slug: row.slug,
    status: row.status,
    ...(row.superseded_at === null ? {} : { supersededAt: row.superseded_at }),
    version: row.spec_version,
  });
}

function publicSlug(projectSlug: string, projectId: string): string {
  return `${projectSlug}-${projectId.replaceAll('-', '').slice(0, 8)}`;
}

function memoryPublicationView(publication: MemoryPublication): WebsitePublication {
  return WebsitePublicationSchema.parse({
    id: publication.id,
    projectId: publication.projectId,
    publicPath: publication.publicPath,
    publishedAt: publication.publishedAt,
    slug: publication.slug,
    status: publication.status,
    ...(publication.supersededAt === undefined ? {} : { supersededAt: publication.supersededAt }),
    version: publication.version,
  });
}

export async function getActiveWebsitePublication(
  context: WorkspaceContext,
  projectId: string,
): Promise<WebsitePublication | undefined> {
  const project = await getWebsiteProject(context, projectId);
  if (getEnvironment().mockMode) {
    const publication = memoryPublications()
      .get(project.id)
      ?.find((item) => item.status === 'active' && item.tenantId === context.actor.tenantId);
    if (publication === undefined) return undefined;
    return memoryPublicationView(publication);
  }
  const result = await createSupabaseAdminClient()
    .from('website_publications')
    .select('id, project_id, published_at, slug, spec_version, status, superseded_at, tenant_id')
    .eq('tenant_id', context.actor.tenantId)
    .eq('project_id', project.id)
    .eq('status', 'active')
    .maybeSingle();
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website publication state could not be loaded.',
    );
  }
  return result.data === null
    ? undefined
    : publicationView(WebsitePublicationRowSchema.parse(result.data));
}

export async function publishWebsite(
  context: WorkspaceContext,
  projectId: string,
  inputValue: WebsitePublishInput,
): Promise<WebsitePublication> {
  const input = WebsitePublishInputSchema.parse(inputValue);
  if (context.actor.role === 'viewer') {
    throw new WebsiteStudioError('WEBSITE_FORBIDDEN', 'Viewer access cannot publish websites.');
  }
  const project = await getWebsiteProject(context, projectId);
  if (project.status !== 'draft') {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'Only a validated website draft can be published.',
    );
  }
  const generation = await getWebsiteSpecVersion(context, project.id, input.version);
  if (generation === undefined) {
    throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The website version was not found.');
  }
  WebsiteSpecSchema.parse(generation.spec);

  if (getEnvironment().mockMode) {
    const now = new Date().toISOString();
    const existing = memoryPublications().get(project.id) ?? [];
    const superseded = existing.map((publication): MemoryPublication =>
      publication.status === 'active'
        ? {
            ...publication,
            status: 'superseded',
            supersededAt: now,
          }
        : publication,
    );
    const slug = publicSlug(project.slug, project.id);
    const publication: MemoryPublication = {
      id: crypto.randomUUID(),
      projectId: project.id,
      publicPath: `/s/${slug}`,
      publishedAt: now,
      slug,
      spec: generation.spec,
      status: 'active',
      tenantId: context.actor.tenantId,
      version: input.version,
    };
    memoryPublications().set(project.id, [...superseded, publication]);
    return memoryPublicationView(publication);
  }

  const result = await createSupabaseAdminClient().rpc('publish_website', {
    actor_user_id: context.actor.userId,
    target_project_id: project.id,
    target_spec_version: input.version,
    target_tenant_id: context.actor.tenantId,
  });
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website could not be published safely.',
    );
  }
  const publication = await getActiveWebsitePublication(context, project.id);
  if (publication === undefined || publication.version !== input.version) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The published website version could not be verified.',
    );
  }
  return publication;
}

export interface PublishedWebsite {
  readonly projectId: string;
  readonly publication: WebsitePublication;
  readonly spec: WebsiteSpec;
  readonly tenantId: string;
}

async function publishedWebsiteFromRow(
  row: z.infer<typeof WebsitePublicationRowSchema>,
): Promise<PublishedWebsite | undefined> {
  const specResult = await createSupabaseAdminClient()
    .from('website_specs')
    .select('spec')
    .eq('tenant_id', row.tenant_id)
    .eq('project_id', row.project_id)
    .eq('version_number', row.spec_version)
    .maybeSingle();
  const parsedSpec = z.object({ spec: WebsiteSpecSchema }).strict().safeParse(specResult.data);
  if (specResult.error !== null || !parsedSpec.success) return undefined;
  return {
    projectId: row.project_id,
    publication: publicationView(row),
    spec: parsedSpec.data.spec,
    tenantId: row.tenant_id,
  };
}

export async function getPublishedWebsiteBySlug(
  slugValue: string,
): Promise<PublishedWebsite | undefined> {
  const slug = z
    .string()
    .min(3)
    .max(96)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .parse(slugValue);
  if (getEnvironment().mockMode) {
    const publication = [...memoryPublications().values()]
      .flat()
      .find((item) => item.slug === slug && item.status === 'active');
    if (publication === undefined) return undefined;
    const { spec, tenantId, ...view } = publication;
    return {
      projectId: publication.projectId,
      publication: WebsitePublicationSchema.parse(view),
      spec: WebsiteSpecSchema.parse(spec),
      tenantId,
    };
  }

  const admin = createSupabaseAdminClient();
  const publicationResult = await admin
    .from('website_publications')
    .select('id, project_id, published_at, slug, spec_version, status, superseded_at, tenant_id')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();
  if (publicationResult.error !== null || publicationResult.data === null) return undefined;
  const row = WebsitePublicationRowSchema.parse(publicationResult.data);
  return publishedWebsiteFromRow(row);
}

export async function getPublishedWebsiteByDomain(
  hostnameValue: string,
): Promise<PublishedWebsite | undefined> {
  let hostname: string;
  try {
    hostname = normalizeCustomerHostname(hostnameValue);
  } catch {
    return undefined;
  }
  if (getEnvironment().mockMode) return undefined;
  const admin = createSupabaseAdminClient();
  const domainResult = await admin
    .from('website_custom_domains')
    .select('project_id, tenant_id')
    .eq('hostname', hostname)
    .eq('status', 'active')
    .eq('ownership_verified', true)
    .eq('routing_verified', true)
    .maybeSingle();
  const domain = z
    .object({
      project_id: z.string().uuid(),
      tenant_id: z.string().uuid(),
    })
    .strict()
    .safeParse(domainResult.data);
  if (domainResult.error !== null || !domain.success) return undefined;
  const publicationResult = await admin
    .from('website_publications')
    .select('id, project_id, published_at, slug, spec_version, status, superseded_at, tenant_id')
    .eq('tenant_id', domain.data.tenant_id)
    .eq('project_id', domain.data.project_id)
    .eq('status', 'active')
    .maybeSingle();
  if (publicationResult.error !== null || publicationResult.data === null) return undefined;
  return publishedWebsiteFromRow(WebsitePublicationRowSchema.parse(publicationResult.data));
}
