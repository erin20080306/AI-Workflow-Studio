import 'server-only';

import { RunOrchestrationError } from '@ai-workflow-studio/run-orchestrator';
import {
  WorkflowSchema,
  summarizeWorkflowRisks,
  validateWorkflow,
  type Workflow,
} from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

import {
  AssistantWorkflowDraftSummarySchema,
  type AssistantWorkflowDraftSummary,
} from '@/lib/assistant-execution-schema';
import { getAssistantConversation } from '@/lib/assistant-conversation-server';
import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { startProductionCloudRun, startProductionRun } from '@/lib/production-run-server';
import { getRunOrchestrator } from '@/lib/run-server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

interface MemoryDraft {
  readonly createdBy: string;
  readonly summary: AssistantWorkflowDraftSummary;
  readonly tenantId: string;
  readonly workflow: Workflow;
}

const executionGlobal = globalThis as typeof globalThis & {
  __aiWorkflowAssistantDrafts?: Map<string, MemoryDraft>;
};

function memoryDrafts(): Map<string, MemoryDraft> {
  executionGlobal.__aiWorkflowAssistantDrafts ??= new Map();
  return executionGlobal.__aiWorkflowAssistantDrafts;
}

const DraftRowSchema = z.object({
  conversation_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  created_by: z.string().uuid(),
  definition_hash: z.string().regex(/^[a-f0-9]{64}$/),
  id: z.string().uuid(),
  message_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  workflow_id: z.string().uuid(),
  workflow_version_id: z.string().uuid(),
});

function assertCanCreate(context: WorkspaceContext): void {
  if (context.actor.role === 'viewer') {
    throw new RunOrchestrationError(
      'RUN_FORBIDDEN',
      'A viewer cannot create or execute workflow drafts.',
    );
  }
}

async function definitionHash(workflow: Workflow): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(workflow));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function summarizeDraft(
  row: z.infer<typeof DraftRowSchema>,
  workflow: Workflow,
): AssistantWorkflowDraftSummary {
  const risk = summarizeWorkflowRisks(workflow);
  return AssistantWorkflowDraftSummarySchema.parse({
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    definitionHash: row.definition_hash,
    id: row.id,
    messageId: row.message_id,
    name: workflow.name,
    nodeCount: workflow.nodes.length,
    risk: {
      destructive: risk.destructive.length,
      external: risk.external.length,
      read: risk.read.length,
      requiresApproval: risk.requiresApproval,
      write: risk.write.length,
    },
    status: 'draft',
    version: 1,
    workflowId: row.workflow_id,
    workflowVersionId: row.workflow_version_id,
  });
}

async function reviewedWorkflow(
  context: WorkspaceContext,
  conversationId: string,
  messageId: string,
): Promise<Workflow> {
  const conversation = await getAssistantConversation(context, conversationId);
  const message = conversation.messages.find(
    (candidate) =>
      candidate.id === messageId &&
      candidate.role === 'assistant' &&
      candidate.status === 'completed' &&
      candidate.plan !== undefined,
  );
  if (message?.plan === undefined) {
    throw new RunOrchestrationError(
      'RUN_INVALID',
      'A completed, validated Plan message is required.',
    );
  }
  const workflow = WorkflowSchema.parse(message.plan.workflow);
  const validation = validateWorkflow(workflow);
  if (!validation.success) {
    throw new RunOrchestrationError(
      'RUN_INVALID',
      'The reviewed workflow no longer passes validation.',
    );
  }
  return workflow;
}

export async function createAssistantWorkflowDraft(
  context: WorkspaceContext,
  input: { readonly conversationId: string; readonly messageId: string },
): Promise<AssistantWorkflowDraftSummary> {
  assertCanCreate(context);
  const workflow = await reviewedWorkflow(context, input.conversationId, input.messageId);
  const hash = await definitionHash(workflow);

  if (getEnvironment().mockMode) {
    const existing = [...memoryDrafts().values()].find(
      (candidate) =>
        candidate.tenantId === context.actor.tenantId &&
        candidate.summary.messageId === input.messageId,
    );
    if (existing !== undefined) {
      if (existing.summary.definitionHash !== hash) {
        throw new RunOrchestrationError(
          'RUN_CONFLICT',
          'The Plan message is already linked to a different workflow definition.',
        );
      }
      return existing.summary;
    }
    const now = new Date().toISOString();
    const row = DraftRowSchema.parse({
      conversation_id: input.conversationId,
      created_at: now,
      created_by: context.actor.userId,
      definition_hash: hash,
      id: crypto.randomUUID(),
      message_id: input.messageId,
      tenant_id: context.actor.tenantId,
      workflow_id: crypto.randomUUID(),
      workflow_version_id: crypto.randomUUID(),
    });
    const summary = summarizeDraft(row, workflow);
    memoryDrafts().set(summary.id, {
      createdBy: context.actor.userId,
      summary,
      tenantId: context.actor.tenantId,
      workflow,
    });
    return summary;
  }

  const admin = createSupabaseAdminClient();
  const existingResult = await admin
    .from('ai_workflow_drafts')
    .select('*')
    .eq('tenant_id', context.actor.tenantId)
    .eq('message_id', input.messageId)
    .maybeSingle();
  if (existingResult.error !== null) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The workflow draft could not be read.');
  }
  if (existingResult.data !== null) {
    const existing = DraftRowSchema.parse(existingResult.data);
    if (existing.definition_hash !== hash) {
      throw new RunOrchestrationError(
        'RUN_CONFLICT',
        'The Plan message is already linked to a different workflow definition.',
      );
    }
    return summarizeDraft(existing, workflow);
  }

  const workflowId = crypto.randomUUID();
  const workflowVersionId = crypto.randomUUID();
  const draftId = crypto.randomUUID();
  const workflowInsert = await admin.from('workflows').insert({
    created_by: context.actor.userId,
    description: workflow.description,
    execution_target: workflow.executionTarget,
    id: workflowId,
    name: workflow.name,
    status: 'draft',
    tenant_id: context.actor.tenantId,
  });
  if (workflowInsert.error !== null) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The workflow draft could not be saved.');
  }

  const versionInsert = await admin.from('workflow_versions').insert({
    created_by: context.actor.userId,
    definition: workflow,
    id: workflowVersionId,
    schema_version: workflow.schemaVersion,
    tenant_id: context.actor.tenantId,
    validation_summary: { definitionHash: hash, success: true },
    version: 1,
    workflow_id: workflowId,
  });
  const activeVersionUpdate =
    versionInsert.error === null
      ? await admin
          .from('workflows')
          .update({ active_version_id: workflowVersionId })
          .eq('id', workflowId)
          .eq('tenant_id', context.actor.tenantId)
      : { error: versionInsert.error };
  const draftInsert =
    activeVersionUpdate.error === null
      ? await admin
          .from('ai_workflow_drafts')
          .insert({
            conversation_id: input.conversationId,
            created_by: context.actor.userId,
            definition_hash: hash,
            id: draftId,
            message_id: input.messageId,
            tenant_id: context.actor.tenantId,
            workflow_id: workflowId,
            workflow_version_id: workflowVersionId,
          })
          .select('*')
          .single()
      : { data: null, error: activeVersionUpdate.error };
  const row = DraftRowSchema.safeParse(draftInsert.data);
  if (versionInsert.error !== null || activeVersionUpdate.error !== null || !row.success) {
    await admin
      .from('workflows')
      .delete()
      .eq('id', workflowId)
      .eq('tenant_id', context.actor.tenantId);
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The workflow draft could not be saved.');
  }
  const audit = await admin.from('audit_logs').insert({
    action: 'assistant.workflow_draft_created',
    actor_user_id: context.actor.userId,
    correlation_id: draftId,
    metadata: {
      conversationId: input.conversationId,
      definitionHash: hash,
      messageId: input.messageId,
      workflowVersionId,
    },
    resource_id: workflowId,
    resource_type: 'workflow',
    tenant_id: context.actor.tenantId,
  });
  if (audit.error !== null) {
    await admin
      .from('workflows')
      .delete()
      .eq('id', workflowId)
      .eq('tenant_id', context.actor.tenantId);
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The workflow draft could not be audited.',
    );
  }
  return summarizeDraft(row.data, workflow);
}

export async function startAssistantWorkflowDraftRun(context: WorkspaceContext, draftId: string) {
  assertCanCreate(context);
  const draft = getEnvironment().mockMode
    ? memoryDrafts().get(draftId)
    : await productionDraft(context, draftId);
  if (draft === undefined || draft.tenantId !== context.actor.tenantId)
    throw new RunOrchestrationError('RUN_NOT_FOUND', 'The reviewed workflow draft was not found.');
  const sharedInput = {
    idempotencyKey: `assistant:${draft.summary.id}`,
    maxAttempts: 3,
    timeoutSeconds: 1_800,
    workflow: draft.workflow,
    workflowId: draft.summary.workflowId,
    workflowVersionId: draft.summary.workflowVersionId,
  };
  const started =
    draft.workflow.executionTarget.type === 'cloud'
      ? getEnvironment().mockMode
        ? (() => {
            throw new RunOrchestrationError(
              'RUN_INVALID',
              'Mock cloud execution is not available; use a configured production workspace.',
            );
          })()
        : await startProductionCloudRun(context, sharedInput)
      : getEnvironment().mockMode
        ? await getRunOrchestrator().start(context.actor, {
            ...sharedInput,
            deviceId: draft.workflow.executionTarget.deviceId,
          })
        : await startProductionRun(context.actor, {
            ...sharedInput,
            deviceId: draft.workflow.executionTarget.deviceId,
          });
  return {
    draft: draft.summary,
    duplicate: started.duplicate,
    run: started.run,
  };
}

async function productionDraft(
  context: WorkspaceContext,
  draftId: string,
): Promise<MemoryDraft | undefined> {
  const admin = createSupabaseAdminClient();
  const draftResult = await admin
    .from('ai_workflow_drafts')
    .select('*')
    .eq('tenant_id', context.actor.tenantId)
    .eq('id', draftId)
    .maybeSingle();
  if (draftResult.error !== null) {
    throw new RunOrchestrationError('RUN_STATE_CONFLICT', 'The workflow draft could not be read.');
  }
  if (draftResult.data === null) return undefined;
  const row = DraftRowSchema.parse(draftResult.data);
  const versionResult = await admin
    .from('workflow_versions')
    .select('definition')
    .eq('tenant_id', context.actor.tenantId)
    .eq('workflow_id', row.workflow_id)
    .eq('id', row.workflow_version_id)
    .maybeSingle();
  if (versionResult.error !== null) {
    throw new RunOrchestrationError(
      'RUN_STATE_CONFLICT',
      'The reviewed workflow version could not be read.',
    );
  }
  if (versionResult.data === null) return undefined;
  const workflow = WorkflowSchema.parse(
    z.object({ definition: z.unknown() }).parse(versionResult.data).definition,
  );
  const hash = await definitionHash(workflow);
  if (hash !== row.definition_hash) {
    throw new RunOrchestrationError(
      'RUN_CONFLICT',
      'The reviewed workflow definition no longer matches its immutable hash.',
    );
  }
  return {
    createdBy: row.created_by,
    summary: summarizeDraft(row, workflow),
    tenantId: row.tenant_id,
    workflow,
  };
}
