import 'server-only';

import type { WebActor } from '@ai-workflow-studio/agent-protocol';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { getEnvironment } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const MOCK_TENANT_ID = '10000000-0000-4000-8000-000000000701';
const MOCK_USER_ID = '10000000-0000-4000-8000-000000000702';

const ClaimsSchema = z
  .object({
    email: z.string().email().optional(),
    sub: z.string().uuid(),
    user_metadata: z
      .object({
        display_name: z.string().min(1).max(120).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const MembershipSchema = z.object({
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
  tenant_id: z.string().uuid(),
});

const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().min(3).max(63),
});

const ProfileSchema = z
  .object({
    display_name: z.string().min(1).max(120).nullable(),
  })
  .nullable();

const SubscriptionSchema = z
  .object({
    plan_code: z.enum(['free', 'pro', 'team', 'business']),
    status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'incomplete']),
  })
  .nullable();

export type AuthenticationErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTH_CONFIGURATION_ERROR'
  | 'AUTH_DATA_INVALID'
  | 'AUTH_WORKSPACE_REQUIRED';

export class AuthenticationError extends Error {
  readonly code: AuthenticationErrorCode;

  constructor(code: AuthenticationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'AuthenticationError';
  }
}

export interface VerifiedIdentity {
  readonly displayName: string;
  readonly email?: string;
  readonly userId: string;
}

export interface WorkspaceContext {
  readonly actor: WebActor;
  readonly displayName: string;
  readonly email?: string;
  readonly platformAdmin: boolean;
  readonly subscription: {
    readonly plan: 'free' | 'pro' | 'team' | 'business';
    readonly status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  };
  readonly tenant: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
}

export function mockWorkspaceContext(): WorkspaceContext {
  return {
    actor: {
      role: 'owner',
      tenantId: MOCK_TENANT_ID,
      userId: MOCK_USER_ID,
    },
    displayName: 'Erin',
    email: 'mock@example.invalid',
    platformAdmin: false,
    subscription: {
      plan: 'team',
      status: 'active',
    },
    tenant: {
      id: MOCK_TENANT_ID,
      name: '營運自動化團隊',
      slug: 'mock-workspace',
    },
  };
}

export async function requireVerifiedIdentity(client?: SupabaseClient): Promise<VerifiedIdentity> {
  if (getEnvironment().mockMode) {
    const context = mockWorkspaceContext();
    return {
      displayName: context.displayName,
      ...(context.email ? { email: context.email } : {}),
      userId: context.actor.userId,
    };
  }

  const supabase = client ?? (await createSupabaseServerClient());
  const { data, error } = await supabase.auth.getClaims();
  if (error !== null || data === null) {
    throw new AuthenticationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  }

  const claims = ClaimsSchema.safeParse(data.claims);
  if (!claims.success) {
    throw new AuthenticationError('AUTH_DATA_INVALID', 'Authenticated identity is invalid.');
  }

  return {
    displayName: claims.data.user_metadata?.display_name ?? claims.data.email ?? 'Workspace member',
    ...(claims.data.email ? { email: claims.data.email } : {}),
    userId: claims.data.sub,
  };
}

export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  if (getEnvironment().mockMode) {
    return mockWorkspaceContext();
  }

  const supabase = await createSupabaseServerClient();
  const identity = await requireVerifiedIdentity(supabase);
  const membershipResult = await supabase
    .from('memberships')
    .select('tenant_id, role')
    .eq('user_id', identity.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipResult.error !== null) {
    throw new AuthenticationError('AUTH_DATA_INVALID', 'Workspace membership could not be read.');
  }
  if (membershipResult.data === null) {
    return null;
  }

  const membership = MembershipSchema.safeParse(membershipResult.data);
  if (!membership.success) {
    throw new AuthenticationError('AUTH_DATA_INVALID', 'Workspace membership is invalid.');
  }

  const [tenantResult, profileResult, subscriptionResult, platformAdminResult] = await Promise.all([
    supabase.from('tenants').select('id, name, slug').eq('id', membership.data.tenant_id).single(),
    supabase.from('profiles').select('display_name').eq('id', identity.userId).maybeSingle(),
    supabase
      .from('tenant_subscriptions')
      .select('plan_code, status')
      .eq('tenant_id', membership.data.tenant_id)
      .maybeSingle(),
    supabase.rpc('is_platform_admin'),
  ]);

  if (
    tenantResult.error !== null ||
    profileResult.error !== null ||
    subscriptionResult.error !== null ||
    platformAdminResult.error !== null
  ) {
    throw new AuthenticationError('AUTH_DATA_INVALID', 'Workspace context could not be read.');
  }

  const tenant = TenantSchema.safeParse(tenantResult.data);
  const profile = ProfileSchema.safeParse(profileResult.data);
  const subscription = SubscriptionSchema.safeParse(subscriptionResult.data);
  if (!tenant.success || !profile.success || !subscription.success) {
    throw new AuthenticationError('AUTH_DATA_INVALID', 'Workspace context is invalid.');
  }

  return {
    actor: {
      role: membership.data.role,
      tenantId: tenant.data.id,
      userId: identity.userId,
    },
    displayName: profile.data?.display_name ?? identity.displayName,
    ...(identity.email ? { email: identity.email } : {}),
    platformAdmin: platformAdminResult.data === true,
    subscription: {
      plan: subscription.data?.plan_code ?? 'free',
      status: subscription.data?.status ?? 'incomplete',
    },
    tenant: tenant.data,
  };
}

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const context = await getWorkspaceContext();
  if (context === null) {
    throw new AuthenticationError(
      'AUTH_WORKSPACE_REQUIRED',
      'An authenticated workspace is required.',
    );
  }
  return context;
}

export async function requireWorkspaceActor(): Promise<WebActor> {
  return (await requireWorkspaceContext()).actor;
}
