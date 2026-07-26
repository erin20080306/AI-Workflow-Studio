import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const TenantSetupSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

const SignupMetadataSchema = z
  .object({
    requested_tenant_name: z.string().trim().min(1).max(120),
    requested_tenant_slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .passthrough();

const MembershipSchema = z
  .object({
    tenant_id: z.string().uuid(),
  })
  .nullable();

export type TenantSetupInput = z.infer<typeof TenantSetupSchema>;

export function parseTenantSetup(input: unknown): TenantSetupInput {
  return TenantSetupSchema.parse(input);
}

export async function createTenantForUser(
  supabase: SupabaseClient,
  userId: string,
  input: TenantSetupInput,
): Promise<string> {
  const setup = TenantSetupSchema.parse(input);
  z.string().uuid().parse(userId);

  const existingResult = await supabase
    .from('memberships')
    .select('tenant_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingResult.error !== null) {
    throw new Error('Workspace membership could not be checked.');
  }

  const existing = MembershipSchema.safeParse(existingResult.data);
  if (!existing.success) {
    throw new Error('Workspace membership response is invalid.');
  }
  if (existing.data !== null) {
    return existing.data.tenant_id;
  }

  const created = await supabase.rpc('create_tenant', {
    tenant_name: setup.name,
    tenant_slug: setup.slug,
  });
  if (created.error === null) {
    return z.string().uuid().parse(created.data);
  }

  if (created.error.code !== '23505') {
    throw new Error('Workspace could not be created.');
  }

  const suffix = userId.replaceAll('-', '').slice(0, 8);
  const fallbackSlug = `${setup.slug.slice(0, 54)}-${suffix}`;
  const fallback = await supabase.rpc('create_tenant', {
    tenant_name: setup.name,
    tenant_slug: fallbackSlug,
  });
  if (fallback.error !== null) {
    throw new Error('Workspace could not be created.');
  }
  return z.string().uuid().parse(fallback.data);
}

export async function ensureTenantFromSignupMetadata(
  supabase: SupabaseClient,
  userId: string,
  metadata: unknown,
): Promise<string | null> {
  const parsed = SignupMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    return null;
  }
  return await createTenantForUser(supabase, userId, {
    name: parsed.data.requested_tenant_name,
    slug: parsed.data.requested_tenant_slug,
  });
}
