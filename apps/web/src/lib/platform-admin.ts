import 'server-only';

import { PLAN_CODES, type PlanCode } from '@ai-workflow-studio/shared/plans';
import { z } from 'zod';

import { requireVerifiedIdentity } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

const PlatformAdminSchema = z.object({
  active: z.literal(true),
  handle: z.string().min(3).max(40),
  role: z.enum(['super_admin', 'support', 'billing_admin']),
  user_id: z.string().uuid(),
});

const TenantRowSchema = z.object({
  created_at: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  owner_user_id: z.string().uuid(),
  slug: z.string().min(3).max(63),
});

const SubscriptionRowSchema = z.object({
  plan_code: z.enum(PLAN_CODES),
  status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'incomplete']),
  tenant_id: z.string().uuid(),
});

export class PlatformAdminError extends Error {
  readonly code: 'ADMIN_FORBIDDEN' | 'ADMIN_NOT_CONFIGURED' | 'ADMIN_DATA_INVALID';

  constructor(
    code: 'ADMIN_FORBIDDEN' | 'ADMIN_NOT_CONFIGURED' | 'ADMIN_DATA_INVALID',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.name = 'PlatformAdminError';
  }
}

export interface PlatformAdminContext {
  readonly displayName: string;
  readonly handle: string;
  readonly role: 'super_admin' | 'support' | 'billing_admin';
  readonly userId: string;
}

export interface AdminTenantRow {
  readonly createdAt: string;
  readonly id: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly plan: PlanCode;
  readonly slug: string;
  readonly status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
}

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  if (getEnvironment().mockMode) {
    throw new PlatformAdminError(
      'ADMIN_NOT_CONFIGURED',
      'Platform administration is unavailable in Mock mode.',
    );
  }

  const identity = await requireVerifiedIdentity(await createSupabaseServerClient());
  const admin = createSupabaseAdminClient();
  const result = await admin
    .from('platform_admins')
    .select('user_id, handle, role, active')
    .eq('user_id', identity.userId)
    .eq('active', true)
    .maybeSingle();

  if (result.error !== null) {
    throw new PlatformAdminError(
      'ADMIN_DATA_INVALID',
      'Platform administrator authorization could not be read.',
    );
  }
  const parsed = PlatformAdminSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new PlatformAdminError('ADMIN_FORBIDDEN', 'Platform administrator access is required.');
  }

  return {
    displayName: identity.displayName,
    handle: parsed.data.handle,
    role: parsed.data.role,
    userId: parsed.data.user_id,
  };
}

export async function getPlatformAdminOverview(): Promise<{
  readonly activeSubscriptions: number;
  readonly tenantCount: number;
  readonly userCount: number;
}> {
  await requirePlatformAdmin();
  const admin = createSupabaseAdminClient();
  const [users, tenants, subscriptions] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('tenants').select('id', { count: 'exact', head: true }),
    admin
      .from('tenant_subscriptions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['trialing', 'active', 'past_due']),
  ]);

  if (users.error !== null || tenants.error !== null || subscriptions.error !== null) {
    throw new PlatformAdminError('ADMIN_DATA_INVALID', 'Platform overview could not be read.');
  }

  return {
    activeSubscriptions: subscriptions.count ?? 0,
    tenantCount: tenants.count ?? 0,
    userCount: users.count ?? 0,
  };
}

export async function listPlatformTenants(): Promise<readonly AdminTenantRow[]> {
  await requirePlatformAdmin();
  const admin = createSupabaseAdminClient();
  const [tenantResult, subscriptionResult] = await Promise.all([
    admin
      .from('tenants')
      .select('id, name, slug, owner_user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    admin.from('tenant_subscriptions').select('tenant_id, plan_code, status'),
  ]);

  if (tenantResult.error !== null || subscriptionResult.error !== null) {
    throw new PlatformAdminError('ADMIN_DATA_INVALID', 'Platform tenants could not be read.');
  }
  const tenants = z.array(TenantRowSchema).safeParse(tenantResult.data);
  const subscriptions = z.array(SubscriptionRowSchema).safeParse(subscriptionResult.data);
  if (!tenants.success || !subscriptions.success) {
    throw new PlatformAdminError('ADMIN_DATA_INVALID', 'Platform tenant response is invalid.');
  }

  const subscriptionByTenant = new Map(
    subscriptions.data.map((subscription) => [subscription.tenant_id, subscription]),
  );
  return tenants.data.map((tenant) => {
    const subscription = subscriptionByTenant.get(tenant.id);
    return {
      createdAt: tenant.created_at,
      id: tenant.id,
      name: tenant.name,
      ownerUserId: tenant.owner_user_id,
      plan: subscription?.plan_code ?? 'free',
      slug: tenant.slug,
      status: subscription?.status ?? 'incomplete',
    };
  });
}
