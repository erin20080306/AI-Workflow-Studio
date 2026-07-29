import 'server-only';

import {
  WebsiteSiteAccessDashboardSchema,
  WebsiteSiteAccessMutationSchema,
  WebsiteSiteAuthInputSchema,
  WebsiteSiteIdentitySchema,
  WebsiteSiteMemberSchema,
  WebsiteSiteRoleSchema,
  type WebsiteSiteAccessDashboard,
  type WebsiteSiteAccessMutation,
  type WebsiteSiteAuthInput,
  type WebsiteSiteIdentity,
  type WebsiteSiteMember,
  type WebsiteSiteRole,
} from '@ai-workflow-studio/website-schema';
import { cookies } from 'next/headers';
import { z } from 'zod';

import type { WorkspaceContext } from './auth/context';
import { getEnvironment } from './env';
import type { PublishedWebsite } from './website-publication-server';
import { createSupabaseAdminClient, createSupabaseServerClient } from './supabase/server';
import { getWebsiteSpecGeneration } from './website-spec-server';
import { getWebsiteProject, WebsiteStudioError } from './website-studio-server';

export const WEBSITE_SITE_SESSION_COOKIE = 'aiws-site-session';

const ConfigRowSchema = z
  .object({
    registration_enabled: z.boolean(),
    reviewed_at: z.string().datetime({ offset: true }),
  })
  .strict();

const RuleRowSchema = z
  .object({
    page_slug: z.string().min(1).max(80),
    required_role: WebsiteSiteRoleSchema,
  })
  .strict();

const MemberRowSchema = z
  .object({
    created_at: z.string().datetime({ offset: true }),
    display_name: z.string().min(1).max(120),
    email: z.string().email().max(254),
    id: z.string().uuid(),
    role: WebsiteSiteRoleSchema,
    status: z.enum(['active', 'suspended']),
    updated_at: z.string().datetime({ offset: true }),
    user_id: z.string().uuid(),
  })
  .strict();

const ClaimsSchema = z
  .object({
    email: z.string().email(),
    sub: z.string().uuid(),
    user_metadata: z
      .object({
        display_name: z.string().min(1).max(120).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

interface MemorySiteAccess {
  readonly members: Map<string, WebsiteSiteMember>;
  readonly rules: Map<string, WebsiteSiteRole>;
  registrationEnabled: boolean;
  reviewedAt: string | null;
}

interface MemorySiteIdentity extends WebsiteSiteIdentity {
  readonly password: string;
}

const accessGlobal = globalThis as typeof globalThis & {
  __aiWorkflowSiteAccess?: Map<string, MemorySiteAccess>;
  __aiWorkflowSiteIdentities?: Map<string, MemorySiteIdentity>;
  __aiWorkflowSiteSessions?: Map<string, WebsiteSiteIdentity>;
};

function memoryAccess(projectId: string): MemorySiteAccess {
  accessGlobal.__aiWorkflowSiteAccess ??= new Map();
  const current = accessGlobal.__aiWorkflowSiteAccess.get(projectId);
  if (current !== undefined) return current;
  const created: MemorySiteAccess = {
    members: new Map(),
    registrationEnabled: false,
    reviewedAt: null,
    rules: new Map(),
  };
  accessGlobal.__aiWorkflowSiteAccess.set(projectId, created);
  return created;
}

function memoryIdentities(): Map<string, MemorySiteIdentity> {
  accessGlobal.__aiWorkflowSiteIdentities ??= new Map();
  return accessGlobal.__aiWorkflowSiteIdentities;
}

function memorySessions(): Map<string, WebsiteSiteIdentity> {
  accessGlobal.__aiWorkflowSiteSessions ??= new Map();
  return accessGlobal.__aiWorkflowSiteSessions;
}

function memberView(value: unknown): WebsiteSiteMember {
  const row = MemberRowSchema.parse(value);
  return WebsiteSiteMemberSchema.parse({
    createdAt: row.created_at,
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    role: row.role,
    status: row.status,
    updatedAt: row.updated_at,
    userId: row.user_id,
  });
}

function suggestedRole(pageSlug: string, pageTitle: string): WebsiteSiteRole | null {
  const value = `${pageSlug} ${pageTitle}`.toLowerCase();
  if (/(?:admin|manage|management|管理後台|管理中心)/u.test(value)) return 'manager';
  if (/(?:staff|employee|team-workspace|員工|團隊專區)/u.test(value)) return 'staff';
  if (/(?:account|dashboard|member|portal|profile|會員|帳戶|個人專區)/u.test(value)) {
    return 'member';
  }
  return null;
}

function assertAccessManager(context: WorkspaceContext): void {
  if (context.actor.role !== 'owner' && context.actor.role !== 'admin') {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'Only a workspace owner or administrator can manage site access.',
    );
  }
}

async function websitePages(context: WorkspaceContext, projectId: string) {
  const generation = await getWebsiteSpecGeneration(context, projectId);
  return generation?.spec.pages.map((page) => ({ slug: page.slug, title: page.title })) ?? [];
}

async function loadProductionAccess(projectId: string, tenantId: string) {
  const admin = createSupabaseAdminClient();
  const [configResult, ruleResult, memberResult] = await Promise.all([
    admin
      .from('website_site_access_configs')
      .select('registration_enabled, reviewed_at')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .maybeSingle(),
    admin
      .from('website_site_page_access')
      .select('page_slug, required_role')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId),
    admin
      .from('website_site_memberships')
      .select('created_at, display_name, email, id, role, status, updated_at, user_id')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(100),
  ]);
  const config = configResult.data === null ? null : ConfigRowSchema.safeParse(configResult.data);
  const rules = z.array(RuleRowSchema).safeParse(ruleResult.data);
  const members = z.array(MemberRowSchema).safeParse(memberResult.data);
  if (
    configResult.error !== null ||
    ruleResult.error !== null ||
    memberResult.error !== null ||
    (config !== null && !config.success) ||
    !rules.success ||
    !members.success
  ) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website access settings could not be loaded.',
    );
  }
  return {
    members: members.data.map(memberView),
    registrationEnabled: config?.data.registration_enabled ?? false,
    reviewedAt: config?.data.reviewed_at ?? null,
    rules: new Map(rules.data.map((rule) => [rule.page_slug, rule.required_role])),
  };
}

export async function getWebsiteSiteAccessDashboard(
  context: WorkspaceContext,
  projectId: string,
): Promise<WebsiteSiteAccessDashboard> {
  const project = await getWebsiteProject(context, projectId);
  const pages = await websitePages(context, project.id);
  const access = getEnvironment().mockMode
    ? memoryAccess(project.id)
    : await loadProductionAccess(project.id, context.actor.tenantId);
  const members = access.members instanceof Map ? [...access.members.values()] : access.members;
  return WebsiteSiteAccessDashboardSchema.parse({
    members: members.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    registrationEnabled: access.registrationEnabled,
    reviewedAt: access.reviewedAt,
    rules: pages.map((page) => ({
      pageSlug: page.slug,
      pageTitle: page.title,
      requiredRole: access.rules.get(page.slug) ?? null,
      suggestedRole: suggestedRole(page.slug, page.title),
    })),
  });
}

async function saveMockMatrix(
  context: WorkspaceContext,
  projectId: string,
  input: Extract<WebsiteSiteAccessMutation, { action: 'save-matrix' }>,
): Promise<void> {
  const access = memoryAccess(projectId);
  access.registrationEnabled = input.registrationEnabled;
  access.reviewedAt = new Date().toISOString();
  access.rules.clear();
  for (const rule of input.rules) {
    if (rule.requiredRole !== null) access.rules.set(rule.pageSlug, rule.requiredRole);
  }
  const existing = access.members.get(context.actor.userId);
  const now = new Date().toISOString();
  access.members.set(
    context.actor.userId,
    WebsiteSiteMemberSchema.parse({
      createdAt: existing?.createdAt ?? now,
      displayName: context.displayName,
      email: context.email ?? `manager-${context.actor.userId}@example.invalid`,
      id: existing?.id ?? crypto.randomUUID(),
      role: 'manager',
      status: 'active',
      updatedAt: now,
      userId: context.actor.userId,
    }),
  );
}

export async function mutateWebsiteSiteAccess(
  context: WorkspaceContext,
  projectId: string,
  mutationValue: WebsiteSiteAccessMutation,
): Promise<WebsiteSiteAccessDashboard> {
  assertAccessManager(context);
  const mutation = WebsiteSiteAccessMutationSchema.parse(mutationValue);
  const project = await getWebsiteProject(context, projectId);
  if (mutation.action === 'save-matrix') {
    const pages = await websitePages(context, project.id);
    if (
      mutation.rules.length !== pages.length ||
      pages.some((page) => !mutation.rules.some((rule) => rule.pageSlug === page.slug))
    ) {
      throw new WebsiteStudioError(
        'WEBSITE_INVALID',
        'The reviewed access matrix must include every current Canvas page.',
      );
    }
    if (getEnvironment().mockMode) {
      await saveMockMatrix(context, project.id, mutation);
    } else {
      const result = await createSupabaseAdminClient().rpc('replace_website_site_access', {
        access_rules: mutation.rules
          .filter((rule) => rule.requiredRole !== null)
          .map((rule) => ({
            pageSlug: rule.pageSlug,
            requiredRole: rule.requiredRole,
          })),
        actor_display_name: context.displayName,
        actor_email: context.email ?? `manager-${context.actor.userId}@example.invalid`,
        actor_user_id: context.actor.userId,
        registration_is_enabled: mutation.registrationEnabled,
        target_project_id: project.id,
        target_tenant_id: context.actor.tenantId,
      });
      if (result.error !== null) {
        throw new WebsiteStudioError(
          'WEBSITE_STATE_CONFLICT',
          'The reviewed access matrix could not be saved atomically.',
        );
      }
    }
  } else if (getEnvironment().mockMode) {
    const access = memoryAccess(project.id);
    const existing = [...access.members.values()].find((member) => member.id === mutation.memberId);
    if (existing === undefined) {
      throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The site member was not found.');
    }
    access.members.set(
      existing.userId,
      WebsiteSiteMemberSchema.parse({
        ...existing,
        role: mutation.role,
        status: mutation.status,
        updatedAt: new Date().toISOString(),
      }),
    );
  } else {
    const result = await createSupabaseAdminClient()
      .from('website_site_memberships')
      .update({
        role: mutation.role,
        status: mutation.status,
        updated_by: context.actor.userId,
      })
      .eq('tenant_id', context.actor.tenantId)
      .eq('project_id', project.id)
      .eq('id', mutation.memberId)
      .select('id')
      .maybeSingle();
    if (result.error !== null || result.data === null) {
      throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The site member was not found.');
    }
  }
  return getWebsiteSiteAccessDashboard(context, project.id);
}

async function publishedAccess(website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>) {
  if (getEnvironment().mockMode) return memoryAccess(website.projectId);
  return loadProductionAccess(website.projectId, website.tenantId);
}

async function currentSiteIdentity(mockToken?: string): Promise<WebsiteSiteIdentity | undefined> {
  if (getEnvironment().mockMode) {
    const token = mockToken ?? (await cookies()).get(WEBSITE_SITE_SESSION_COOKIE)?.value;
    return token === undefined ? undefined : memorySessions().get(token);
  }
  const result = await (await createSupabaseServerClient()).auth.getClaims();
  if (result.error !== null || result.data === null) return undefined;
  const claims = ClaimsSchema.safeParse(result.data.claims);
  if (!claims.success) return undefined;
  return WebsiteSiteIdentitySchema.parse({
    displayName:
      claims.data.user_metadata?.display_name ?? claims.data.email.split('@')[0] ?? 'Member',
    email: claims.data.email,
    userId: claims.data.sub,
  });
}

async function siteMember(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
  userId: string,
): Promise<WebsiteSiteMember | undefined> {
  if (getEnvironment().mockMode) return memoryAccess(website.projectId).members.get(userId);
  const result = await createSupabaseAdminClient()
    .from('website_site_memberships')
    .select('created_at, display_name, email, id, role, status, updated_at, user_id')
    .eq('tenant_id', website.tenantId)
    .eq('project_id', website.projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The site membership could not be verified.',
    );
  }
  return result.data === null ? undefined : memberView(result.data);
}

const roleRank: Readonly<Record<WebsiteSiteRole, number>> = {
  manager: 3,
  member: 1,
  staff: 2,
};

export interface WebsitePageAccessState {
  readonly allowed: boolean;
  readonly identity?: WebsiteSiteIdentity;
  readonly member?: WebsiteSiteMember;
  readonly registrationEnabled: boolean;
  readonly requiredRole: WebsiteSiteRole | null;
}

export async function getWebsitePageAccessState(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
  pageSlug: string,
  mockToken?: string,
): Promise<WebsitePageAccessState> {
  const [access, identity] = await Promise.all([
    publishedAccess(website),
    currentSiteIdentity(mockToken),
  ]);
  const requiredRole = access.rules.get(pageSlug) ?? null;
  const member = identity === undefined ? undefined : await siteMember(website, identity.userId);
  const allowed =
    requiredRole === null ||
    (member !== undefined &&
      member.status === 'active' &&
      roleRank[member.role] >= roleRank[requiredRole]);
  return {
    allowed,
    ...(identity === undefined ? {} : { identity }),
    ...(member === undefined ? {} : { member }),
    registrationEnabled: access.registrationEnabled,
    requiredRole,
  };
}

export async function getWebsiteSiteAuthState(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
  mockToken?: string,
) {
  const [access, identity] = await Promise.all([
    publishedAccess(website),
    currentSiteIdentity(mockToken),
  ]);
  const member = identity === undefined ? undefined : await siteMember(website, identity.userId);
  return {
    ...(identity === undefined ? {} : { identity }),
    ...(member === undefined ? {} : { member }),
    registrationEnabled: access.registrationEnabled,
  };
}

async function ensureSiteMember(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
  identity: WebsiteSiteIdentity,
): Promise<WebsiteSiteMember> {
  const existing = await siteMember(website, identity.userId);
  if (existing !== undefined) {
    if (existing.status !== 'active') {
      throw new WebsiteStudioError('WEBSITE_FORBIDDEN', 'This site membership is suspended.');
    }
    if (getEnvironment().mockMode) return existing;
    const updated = await createSupabaseAdminClient()
      .from('website_site_memberships')
      .update({
        display_name: identity.displayName,
        email: identity.email,
        updated_by: identity.userId,
      })
      .eq('tenant_id', website.tenantId)
      .eq('project_id', website.projectId)
      .eq('user_id', identity.userId)
      .select('created_at, display_name, email, id, role, status, updated_at, user_id')
      .single();
    if (updated.error !== null) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The site membership could not be refreshed.',
      );
    }
    return memberView(updated.data);
  }
  const access = await publishedAccess(website);
  if (!access.registrationEnabled) {
    throw new WebsiteStudioError('WEBSITE_FORBIDDEN', 'Registration is closed for this site.');
  }
  let memberCount: number;
  if (getEnvironment().mockMode) {
    memberCount = access.members instanceof Map ? access.members.size : access.members.length;
  } else {
    const countResult = await createSupabaseAdminClient()
      .from('website_site_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', website.tenantId)
      .eq('project_id', website.projectId);
    if (countResult.error !== null || countResult.count === null) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The site member limit could not be verified.',
      );
    }
    memberCount = countResult.count;
  }
  if (memberCount >= 5_000) {
    throw new WebsiteStudioError('WEBSITE_RATE_LIMITED', 'This site has reached its member limit.');
  }
  const now = new Date().toISOString();
  if (getEnvironment().mockMode) {
    const created = WebsiteSiteMemberSchema.parse({
      createdAt: now,
      displayName: identity.displayName,
      email: identity.email,
      id: crypto.randomUUID(),
      role: 'member',
      status: 'active',
      updatedAt: now,
      userId: identity.userId,
    });
    memoryAccess(website.projectId).members.set(identity.userId, created);
    return created;
  }
  const result = await createSupabaseAdminClient()
    .from('website_site_memberships')
    .insert({
      created_by: identity.userId,
      display_name: identity.displayName,
      email: identity.email,
      project_id: website.projectId,
      role: 'member',
      status: 'active',
      tenant_id: website.tenantId,
      updated_by: identity.userId,
      user_id: identity.userId,
    })
    .select('created_at, display_name, email, id, role, status, updated_at, user_id')
    .single();
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The site membership could not be created.',
    );
  }
  return memberView(result.data);
}

export async function ensureCurrentWebsiteSiteMember(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
): Promise<WebsiteSiteMember> {
  const identity = await currentSiteIdentity();
  if (identity === undefined) {
    throw new WebsiteStudioError('WEBSITE_FORBIDDEN', 'The site identity could not be verified.');
  }
  return ensureSiteMember(website, identity);
}

function applicationOrigin(): string {
  const environment = getEnvironment();
  if (environment.appUrl !== undefined) return environment.appUrl.replace(/\/$/u, '');
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  throw new WebsiteStudioError(
    'WEBSITE_STATE_CONFLICT',
    'The application origin is not configured.',
  );
}

export interface WebsiteSiteAuthResult {
  readonly kind: 'authenticated' | 'check-email' | 'signed-out';
  readonly mockSessionToken?: string;
}

export async function executeWebsiteSiteAuth(
  website: Pick<PublishedWebsite, 'projectId' | 'publication' | 'tenantId'>,
  inputValue: WebsiteSiteAuthInput,
): Promise<WebsiteSiteAuthResult> {
  const input = WebsiteSiteAuthInputSchema.parse(inputValue);
  if (input.action === 'logout') {
    if (!getEnvironment().mockMode) {
      await (await createSupabaseServerClient()).auth.signOut({ scope: 'local' });
    }
    return { kind: 'signed-out' };
  }
  const access = await publishedAccess(website);
  if (input.action === 'register' && !access.registrationEnabled) {
    throw new WebsiteStudioError('WEBSITE_FORBIDDEN', 'Registration is closed for this site.');
  }
  if (getEnvironment().mockMode) {
    let identity = memoryIdentities().get(input.email);
    if (input.action === 'register') {
      if (identity !== undefined) {
        throw new WebsiteStudioError('WEBSITE_STATE_CONFLICT', 'This account already exists.');
      }
      identity = WebsiteSiteIdentitySchema.extend({ password: z.string() }).parse({
        displayName: input.displayName,
        email: input.email,
        password: input.password,
        userId: crypto.randomUUID(),
      });
      memoryIdentities().set(input.email, identity);
    } else if (identity === undefined || identity.password !== input.password) {
      throw new WebsiteStudioError('WEBSITE_FORBIDDEN', 'The email or password is invalid.');
    }
    await ensureSiteMember(website, identity);
    const token = crypto.randomUUID();
    memorySessions().set(token, identity);
    return { kind: 'authenticated', mockSessionToken: token };
  }
  const supabase = await createSupabaseServerClient();
  if (input.action === 'login') {
    const result = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (result.error !== null || result.data.user === null) {
      throw new WebsiteStudioError('WEBSITE_FORBIDDEN', 'The email or password is invalid.');
    }
    const identity = WebsiteSiteIdentitySchema.parse({
      displayName:
        z.string().min(1).max(120).safeParse(result.data.user.user_metadata.display_name).data ??
        result.data.user.email?.split('@')[0] ??
        'Member',
      email: result.data.user.email,
      userId: result.data.user.id,
    });
    try {
      await ensureSiteMember(website, identity);
    } catch (error) {
      await supabase.auth.signOut({ scope: 'local' });
      throw error;
    }
    return { kind: 'authenticated' };
  }
  const result = await supabase.auth.signUp({
    email: input.email,
    options: {
      data: { display_name: input.displayName, site_registration: true },
      emailRedirectTo: `${applicationOrigin()}/api/public-sites/${
        website.publication.slug
      }/confirm?pageSlug=${encodeURIComponent(input.pageSlug)}`,
    },
    password: input.password,
  });
  if (result.error !== null || result.data.user === null) {
    throw new WebsiteStudioError('WEBSITE_STATE_CONFLICT', 'Registration is unavailable.');
  }
  if (result.data.session === null) return { kind: 'check-email' };
  await ensureSiteMember(
    website,
    WebsiteSiteIdentitySchema.parse({
      displayName: input.displayName,
      email: input.email,
      userId: result.data.user.id,
    }),
  );
  return { kind: 'authenticated' };
}
