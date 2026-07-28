'use server';

import { PLAN_CODES } from '@ai-workflow-studio/shared/plans';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/platform-admin';
import {
  isAccountModelCompatibleWithTier,
  type ProductionAiProvider,
} from '@/lib/ai-model-catalog';
import { getAiProviderHealth } from '@/lib/ai-provider-health';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const PlanChangeSchema = z
  .object({
    plan: z.enum(PLAN_CODES),
    tenantId: z.string().uuid(),
  })
  .strict();

const ModelMappingSchema = z
  .object({
    enabled: z.boolean(),
    model: z.string().regex(/^[A-Za-z0-9._:-]{2,120}$/),
    provider: z.enum(['anthropic', 'gemini', 'openai']),
    tier: z.enum(['economy', 'standard', 'advanced', 'flagship']),
  })
  .superRefine((value, context) => {
    if (!isAccountModelCompatibleWithTier(value.provider, value.tier, value.model)) {
      context.addIssue({
        code: 'custom',
        message: 'Model family is not compatible with this cost tier.',
        path: ['model'],
      });
    }
  });

export async function changeTenantPlanAction(formData: FormData): Promise<never> {
  const actor = await requirePlatformAdmin();
  if (actor.role === 'support') {
    redirect('/admin?status=forbidden');
  }

  const parsed = PlanChangeSchema.safeParse({
    plan: formData.get('plan'),
    tenantId: formData.get('tenantId'),
  });
  if (!parsed.success) {
    redirect('/admin?status=invalid-plan');
  }

  const admin = createSupabaseAdminClient();
  const updateResult = await admin.rpc('platform_admin_change_tenant_plan', {
    actor_id: actor.userId,
    target_plan_code: parsed.data.plan,
    target_tenant_id: parsed.data.tenantId,
  });
  if (updateResult.error !== null) {
    redirect('/admin?status=update-failed');
  }

  revalidatePath('/admin');
  redirect('/admin?status=plan-updated');
}

export async function updateAiModelMappingAction(formData: FormData): Promise<never> {
  const actor = await requirePlatformAdmin();
  if (actor.role !== 'super_admin') {
    redirect('/admin/ai-providers?status=forbidden');
  }
  const parsed = ModelMappingSchema.safeParse({
    enabled: formData.get('enabled') === 'on',
    model: formData.get('model'),
    provider: formData.get('provider'),
    tier: formData.get('tier'),
  });
  if (!parsed.success) {
    redirect('/admin/ai-providers?status=invalid-mapping');
  }
  const providerHealth = await getAiProviderHealth(parsed.data.provider, { force: true });
  if (providerHealth.status !== 'available' || !providerHealth.models.includes(parsed.data.model)) {
    redirect('/admin/ai-providers?status=invalid-mapping');
  }
  const result = await createSupabaseAdminClient().rpc('platform_admin_update_ai_model_mapping', {
    actor_id: actor.userId,
    target_enabled: parsed.data.enabled,
    target_model: parsed.data.model,
    target_provider: parsed.data.provider satisfies ProductionAiProvider,
    target_tier: parsed.data.tier,
  });
  if (result.error !== null) {
    redirect('/admin/ai-providers?status=update-failed');
  }
  revalidatePath('/admin/ai-providers');
  redirect('/admin/ai-providers?status=model-updated');
}
