'use server';

import { PLAN_CODES } from '@ai-workflow-studio/shared/plans';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/platform-admin';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const PlanChangeSchema = z
  .object({
    plan: z.enum(PLAN_CODES),
    tenantId: z.string().uuid(),
  })
  .strict();

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
