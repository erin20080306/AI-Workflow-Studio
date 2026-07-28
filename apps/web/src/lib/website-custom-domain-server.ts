import 'server-only';

import {
  WebsiteCustomDomainSchema,
  WebsiteDnsRecordSchema,
  type WebsiteCustomDomain,
  type WebsiteCustomDomainStatus,
  type WebsiteDnsRecord,
} from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import {
  VercelCustomDomainError,
  addVercelProjectDomain,
  verifyVercelProjectDomain,
  type VercelDomainState,
} from '@/lib/vercel-custom-domain-client';
import {
  buildRoutingDnsRecord,
  normalizeCustomerHostname,
  websiteCustomDomainUrl,
} from '@/lib/website-custom-domain';
import { canManageWebsiteCustomDomains } from '@/lib/website-custom-domain-access';
import { getActiveWebsitePublication } from '@/lib/website-publication-server';
import { getWebsiteProject, WebsiteStudioError } from '@/lib/website-studio-server';
import { websiteSiteUrl } from '@/lib/website-site-host';

const WebsiteCustomDomainRowSchema = z
  .object({
    activated_at: z.string().datetime({ offset: true }).nullable(),
    created_at: z.string().datetime({ offset: true }),
    dns_records: z.array(WebsiteDnsRecordSchema).max(4),
    hostname: z.string().min(4).max(253),
    id: z.string().uuid(),
    last_checked_at: z.string().datetime({ offset: true }).nullable(),
    ownership_verified: z.boolean(),
    project_id: z.string().uuid(),
    routing_verified: z.boolean(),
    status: z.enum(['active', 'disabled', 'failed', 'pending_dns', 'pending_ownership']),
    tenant_id: z.string().uuid(),
  })
  .strict();

interface MemoryCustomDomain {
  activatedAt?: string;
  readonly createdAt: string;
  readonly dnsRecords: readonly WebsiteDnsRecord[];
  readonly hostname: string;
  readonly id: string;
  lastCheckedAt?: string;
  ownershipVerified: boolean;
  readonly projectId: string;
  routingVerified: boolean;
  status: WebsiteCustomDomainStatus;
  readonly tenantId: string;
}

const domainGlobal = globalThis as typeof globalThis & {
  __aiWorkflowWebsiteCustomDomains?: Map<string, MemoryCustomDomain>;
};

function memoryDomains(): Map<string, MemoryCustomDomain> {
  domainGlobal.__aiWorkflowWebsiteCustomDomains ??= new Map();
  return domainGlobal.__aiWorkflowWebsiteCustomDomains;
}

function assertCanManageDomains(context: WorkspaceContext): void {
  if (!canManageWebsiteCustomDomains(context)) {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'Custom domains require an active paid subscription and workspace owner or admin access.',
    );
  }
}

function stateStatus(state: VercelDomainState): WebsiteCustomDomainStatus {
  if (!state.ownershipVerified) return 'pending_ownership';
  return state.routingVerified ? 'active' : 'pending_dns';
}

async function domainFingerprint(hostname: string): Promise<string> {
  const bytes = new TextEncoder().encode(hostname);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

async function recordDomainAudit(
  context: WorkspaceContext,
  input: {
    readonly action: string;
    readonly domainId: string;
    readonly hostname: string;
    readonly projectId: string;
    readonly recordTypes: readonly string[];
    readonly status: WebsiteCustomDomainStatus;
  },
): Promise<void> {
  if (getEnvironment().mockMode) return;
  const result = await createSupabaseAdminClient()
    .from('audit_logs')
    .insert({
      action: input.action,
      actor_user_id: context.actor.userId,
      correlation_id: input.projectId,
      metadata: {
        domainId: input.domainId,
        hostnameHash: await domainFingerprint(input.hostname),
        recordTypes: input.recordTypes,
        status: input.status,
      },
      resource_id: input.domainId,
      resource_type: 'website_custom_domain',
      tenant_id: context.actor.tenantId,
    });
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The custom-domain operation could not be audited.',
    );
  }
}

function customDomainView(
  value: MemoryCustomDomain | z.infer<typeof WebsiteCustomDomainRowSchema>,
  fallbackUrl: string,
): WebsiteCustomDomain {
  if ('project_id' in value) {
    const row = WebsiteCustomDomainRowSchema.parse(value);
    return WebsiteCustomDomainSchema.parse({
      ...(row.activated_at === null ? {} : { activatedAt: row.activated_at }),
      createdAt: row.created_at,
      dnsRecords: row.dns_records,
      fallbackUrl,
      hostname: row.hostname,
      id: row.id,
      ...(row.last_checked_at === null ? {} : { lastCheckedAt: row.last_checked_at }),
      ownershipVerified: row.ownership_verified,
      projectId: row.project_id,
      publicUrl: websiteCustomDomainUrl(row.hostname),
      routingVerified: row.routing_verified,
      status: row.status,
    });
  }
  return WebsiteCustomDomainSchema.parse({
    ...(value.activatedAt === undefined ? {} : { activatedAt: value.activatedAt }),
    createdAt: value.createdAt,
    dnsRecords: value.dnsRecords,
    fallbackUrl,
    hostname: value.hostname,
    id: value.id,
    ...(value.lastCheckedAt === undefined ? {} : { lastCheckedAt: value.lastCheckedAt }),
    ownershipVerified: value.ownershipVerified,
    projectId: value.projectId,
    publicUrl: websiteCustomDomainUrl(value.hostname),
    routingVerified: value.routingVerified,
    status: value.status,
  });
}

async function activePublicationFallback(
  context: WorkspaceContext,
  projectId: string,
): Promise<string> {
  const publication = await getActiveWebsitePublication(context, projectId);
  if (publication === undefined) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'Publish a validated website version before claiming a custom domain.',
    );
  }
  return websiteSiteUrl(publication.slug);
}

async function updateStoredDomain(
  context: WorkspaceContext,
  domainId: string,
  state: VercelDomainState,
): Promise<z.infer<typeof WebsiteCustomDomainRowSchema>> {
  const now = new Date().toISOString();
  const status = stateStatus(state);
  const result = await createSupabaseAdminClient()
    .from('website_custom_domains')
    .update({
      activated_at: status === 'active' ? now : null,
      dns_records: state.dnsRecords,
      last_checked_at: now,
      last_error_code: null,
      ownership_verified: state.ownershipVerified,
      routing_verified: state.routingVerified,
      status,
      updated_at: now,
      updated_by: context.actor.userId,
    })
    .eq('id', domainId)
    .eq('tenant_id', context.actor.tenantId)
    .select(
      'id, tenant_id, project_id, hostname, status, ownership_verified, routing_verified, dns_records, created_at, last_checked_at, activated_at',
    )
    .single();
  const parsed = WebsiteCustomDomainRowSchema.safeParse(result.data);
  if (result.error !== null || !parsed.success) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The custom-domain verification state could not be saved.',
    );
  }
  return parsed.data;
}

async function markProviderFailure(
  context: WorkspaceContext,
  domainId: string,
  error: VercelCustomDomainError,
): Promise<void> {
  if (getEnvironment().mockMode) return;
  await createSupabaseAdminClient()
    .from('website_custom_domains')
    .update({
      activated_at: null,
      last_checked_at: new Date().toISOString(),
      last_error_code: error.code,
      ownership_verified: false,
      routing_verified: false,
      status: 'failed',
      updated_at: new Date().toISOString(),
      updated_by: context.actor.userId,
    })
    .eq('id', domainId)
    .eq('tenant_id', context.actor.tenantId);
}

function providerWebsiteError(error: VercelCustomDomainError): WebsiteStudioError {
  return new WebsiteStudioError(
    error.code === 'PROVIDER_REJECTED' ? 'WEBSITE_STATE_CONFLICT' : 'WEBSITE_PROVIDER_UNAVAILABLE',
    error.message,
    { cause: error },
  );
}

export async function listWebsiteCustomDomains(
  context: WorkspaceContext,
  projectId: string,
): Promise<readonly WebsiteCustomDomain[]> {
  const project = await getWebsiteProject(context, projectId);
  const publication = await getActiveWebsitePublication(context, project.id);
  if (publication === undefined) return [];
  const fallbackUrl = websiteSiteUrl(publication.slug);
  if (getEnvironment().mockMode) {
    return [...memoryDomains().values()]
      .filter(
        (domain) => domain.tenantId === context.actor.tenantId && domain.projectId === project.id,
      )
      .map((domain) => customDomainView(domain, fallbackUrl));
  }
  const result = await createSupabaseAdminClient()
    .from('website_custom_domains')
    .select(
      'id, tenant_id, project_id, hostname, status, ownership_verified, routing_verified, dns_records, created_at, last_checked_at, activated_at',
    )
    .eq('tenant_id', context.actor.tenantId)
    .eq('project_id', project.id)
    .neq('status', 'disabled')
    .order('created_at', { ascending: false })
    .limit(20);
  const rows = z.array(WebsiteCustomDomainRowSchema).safeParse(result.data);
  if (result.error !== null || !rows.success) {
    throw new WebsiteStudioError('WEBSITE_STATE_CONFLICT', 'Custom domains could not be loaded.');
  }
  return rows.data.map((row) => customDomainView(row, fallbackUrl));
}

export async function claimWebsiteCustomDomain(
  context: WorkspaceContext,
  projectId: string,
  hostnameValue: string,
): Promise<WebsiteCustomDomain> {
  assertCanManageDomains(context);
  const project = await getWebsiteProject(context, projectId);
  const fallbackUrl = await activePublicationFallback(context, project.id);
  let hostname: string;
  try {
    hostname = normalizeCustomerHostname(hostnameValue);
  } catch {
    throw new WebsiteStudioError(
      'WEBSITE_INVALID',
      'Enter a valid customer-owned hostname outside the platform domain.',
    );
  }

  if (getEnvironment().mockMode) {
    const existing = [...memoryDomains().values()].find((domain) => domain.hostname === hostname);
    if (
      existing !== undefined &&
      (existing.tenantId !== context.actor.tenantId || existing.projectId !== project.id)
    ) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'This hostname is already claimed by another website.',
      );
    }
    const now = new Date().toISOString();
    const domain: MemoryCustomDomain = existing ?? {
      createdAt: now,
      dnsRecords: [
        buildRoutingDnsRecord({
          apexName: hostname,
          hostname,
        }),
      ],
      hostname,
      id: crypto.randomUUID(),
      ownershipVerified: true,
      projectId: project.id,
      routingVerified: false,
      status: 'pending_dns',
      tenantId: context.actor.tenantId,
    };
    memoryDomains().set(domain.id, domain);
    return customDomainView(domain, fallbackUrl);
  }

  const admin = createSupabaseAdminClient();
  const existing = await admin
    .from('website_custom_domains')
    .select(
      'id, tenant_id, project_id, hostname, status, ownership_verified, routing_verified, dns_records, created_at, last_checked_at, activated_at',
    )
    .eq('hostname', hostname)
    .maybeSingle();
  if (existing.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The custom hostname could not be checked.',
    );
  }
  const existingRow =
    existing.data === null ? undefined : WebsiteCustomDomainRowSchema.parse(existing.data);
  if (
    existingRow !== undefined &&
    (existingRow.tenant_id !== context.actor.tenantId || existingRow.project_id !== project.id)
  ) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'This hostname is already claimed by another website.',
    );
  }
  if (existingRow?.status === 'active') {
    return customDomainView(existingRow, fallbackUrl);
  }

  const domainId = existingRow?.id ?? crypto.randomUUID();
  if (existingRow === undefined) {
    const inserted = await admin.from('website_custom_domains').insert({
      created_by: context.actor.userId,
      hostname,
      id: domainId,
      last_error_code: 'PROVISIONING',
      project_id: project.id,
      status: 'failed',
      tenant_id: context.actor.tenantId,
      updated_by: context.actor.userId,
    });
    if (inserted.error !== null) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'This hostname could not be claimed safely.',
      );
    }
  }

  try {
    const state = await addVercelProjectDomain(hostname);
    const row = await updateStoredDomain(context, domainId, state);
    await recordDomainAudit(context, {
      action: 'website_domain.claimed',
      domainId,
      hostname,
      projectId: project.id,
      recordTypes: state.dnsRecords.map((record) => record.type),
      status: row.status,
    });
    return customDomainView(row, fallbackUrl);
  } catch (error) {
    if (error instanceof VercelCustomDomainError) {
      await markProviderFailure(context, domainId, error);
      await recordDomainAudit(context, {
        action: 'website_domain.failed',
        domainId,
        hostname,
        projectId: project.id,
        recordTypes: [],
        status: 'failed',
      });
      throw providerWebsiteError(error);
    }
    throw error;
  }
}

export async function verifyWebsiteCustomDomain(
  context: WorkspaceContext,
  projectId: string,
  domainId: string,
): Promise<WebsiteCustomDomain> {
  assertCanManageDomains(context);
  const project = await getWebsiteProject(context, projectId);
  const fallbackUrl = await activePublicationFallback(context, project.id);
  const id = z.string().uuid().parse(domainId);

  if (getEnvironment().mockMode) {
    const domain = memoryDomains().get(id);
    if (
      domain === undefined ||
      domain.tenantId !== context.actor.tenantId ||
      domain.projectId !== project.id
    ) {
      throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The custom domain was not found.');
    }
    const now = new Date().toISOString();
    domain.activatedAt = now;
    domain.lastCheckedAt = now;
    domain.ownershipVerified = true;
    domain.routingVerified = true;
    domain.status = 'active';
    return customDomainView(domain, fallbackUrl);
  }

  const result = await createSupabaseAdminClient()
    .from('website_custom_domains')
    .select('id, hostname')
    .eq('id', id)
    .eq('tenant_id', context.actor.tenantId)
    .eq('project_id', project.id)
    .maybeSingle();
  const parsed = z
    .object({ hostname: z.string().min(4).max(253), id: z.string().uuid() })
    .strict()
    .safeParse(result.data);
  if (result.error !== null || !parsed.success) {
    throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The custom domain was not found.');
  }
  try {
    const state = await verifyVercelProjectDomain(parsed.data.hostname);
    const row = await updateStoredDomain(context, id, state);
    await recordDomainAudit(context, {
      action: 'website_domain.verified',
      domainId: id,
      hostname: parsed.data.hostname,
      projectId: project.id,
      recordTypes: state.dnsRecords.map((record) => record.type),
      status: row.status,
    });
    return customDomainView(row, fallbackUrl);
  } catch (error) {
    if (error instanceof VercelCustomDomainError) {
      await markProviderFailure(context, id, error);
      throw providerWebsiteError(error);
    }
    throw error;
  }
}
