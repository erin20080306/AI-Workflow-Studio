import 'server-only';

import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import {
  WebsiteIntegrationChecklistSchema,
  WebsiteIntegrationKindSchema,
  WebsiteIntegrationPlanInputSchema,
  WebsiteIntegrationPlanSchema,
  WebsiteIntegrationPlanStatusSchema,
  WebsiteIntegrationProviderSchema,
  websiteIntegrationPlanStatus,
  type WebsiteIntegrationPlan,
  type WebsiteIntegrationPlanInput,
} from '@/lib/website-integration-guidance';
import { canManageWebsiteIntegrations } from '@/lib/website-static-export-access';
import { getWebsiteProject, WebsiteStudioError } from '@/lib/website-studio-server';

const WebsiteIntegrationPlanRowSchema = z.object({
  checklist: WebsiteIntegrationChecklistSchema,
  kind: WebsiteIntegrationKindSchema,
  provider: WebsiteIntegrationProviderSchema,
  status: WebsiteIntegrationPlanStatusSchema,
  updated_at: z.string().datetime({ offset: true }),
});

const integrationGlobal = globalThis as typeof globalThis & {
  __aiWorkflowWebsiteIntegrationPlans?: Map<string, WebsiteIntegrationPlan>;
};

function memoryPlans(): Map<string, WebsiteIntegrationPlan> {
  integrationGlobal.__aiWorkflowWebsiteIntegrationPlans ??= new Map();
  return integrationGlobal.__aiWorkflowWebsiteIntegrationPlans;
}

function memoryKey(context: WorkspaceContext, projectId: string, kind: string): string {
  return `${context.actor.tenantId}:${projectId}:${kind}`;
}

function assertIntegrationAccess(context: WorkspaceContext): void {
  if (!canManageWebsiteIntegrations(context)) {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'Website integrations require an active paid subscription and an owner or administrator role.',
    );
  }
}

function planView(value: unknown): WebsiteIntegrationPlan {
  const row = WebsiteIntegrationPlanRowSchema.parse(value);
  return WebsiteIntegrationPlanSchema.parse({
    checklist: row.checklist,
    kind: row.kind,
    provider: row.provider,
    status: row.status,
    updatedAt: row.updated_at,
  });
}

async function auditIntegrationPlan(
  context: WorkspaceContext,
  projectId: string,
  plan: WebsiteIntegrationPlan,
): Promise<void> {
  if (getEnvironment().mockMode) return;
  const result = await createSupabaseAdminClient()
    .from('audit_logs')
    .insert({
      action:
        plan.status === 'test_accepted'
          ? 'website.integration_test_accepted'
          : 'website.integration_plan_updated',
      actor_user_id: context.actor.userId,
      correlation_id: projectId,
      metadata: {
        kind: plan.kind,
        provider: plan.provider,
        status: plan.status,
      },
      resource_id: projectId,
      resource_type: 'website_project',
      tenant_id: context.actor.tenantId,
    });
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website integration plan could not be audited.',
    );
  }
}

export async function listWebsiteIntegrationPlans(
  context: WorkspaceContext,
  projectId: string,
): Promise<readonly WebsiteIntegrationPlan[]> {
  assertIntegrationAccess(context);
  const project = await getWebsiteProject(context, projectId);
  if (getEnvironment().mockMode) {
    return [...memoryPlans().entries()]
      .filter(([key]) => key.startsWith(`${context.actor.tenantId}:${project.id}:`))
      .map(([, plan]) => plan)
      .sort((left, right) => left.kind.localeCompare(right.kind));
  }
  const result = await createSupabaseAdminClient()
    .from('website_integration_plans')
    .select('checklist, kind, provider, status, updated_at')
    .eq('tenant_id', context.actor.tenantId)
    .eq('project_id', project.id)
    .order('kind', { ascending: true });
  const rows = z.array(WebsiteIntegrationPlanRowSchema).safeParse(result.data);
  if (result.error !== null || !rows.success) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'Website integration plans could not be loaded.',
    );
  }
  return rows.data.map(planView);
}

export async function saveWebsiteIntegrationPlan(
  context: WorkspaceContext,
  projectId: string,
  rawInput: WebsiteIntegrationPlanInput,
): Promise<WebsiteIntegrationPlan> {
  assertIntegrationAccess(context);
  const project = await getWebsiteProject(context, projectId);
  const input = WebsiteIntegrationPlanInputSchema.parse(rawInput);
  const status = websiteIntegrationPlanStatus(input.checklist);
  const updatedAt = new Date().toISOString();
  const plan = WebsiteIntegrationPlanSchema.parse({
    ...input,
    status,
    updatedAt,
  });

  if (getEnvironment().mockMode) {
    memoryPlans().set(memoryKey(context, project.id, input.kind), plan);
    return plan;
  }

  const confirmed = status === 'test_accepted';
  const result = await createSupabaseAdminClient()
    .from('website_integration_plans')
    .upsert(
      {
        checklist: input.checklist,
        confirmed_at: confirmed ? updatedAt : null,
        confirmed_by: confirmed ? context.actor.userId : null,
        kind: input.kind,
        project_id: project.id,
        provider: input.provider,
        status,
        tenant_id: context.actor.tenantId,
      },
      { onConflict: 'project_id,kind' },
    )
    .select('checklist, kind, provider, status, updated_at')
    .single();
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website integration plan could not be saved.',
    );
  }
  const saved = planView(result.data);
  await auditIntegrationPlan(context, project.id, saved);
  return saved;
}
