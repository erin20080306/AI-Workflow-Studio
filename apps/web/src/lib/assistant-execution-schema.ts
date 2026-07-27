import { WorkflowRunViewSchema } from '@ai-workflow-studio/run-orchestrator';
import { z } from 'zod';

export const AssistantWorkflowRiskCountsSchema = z
  .object({
    destructive: z.number().int().min(0).max(200),
    external: z.number().int().min(0).max(200),
    read: z.number().int().min(0).max(200),
    requiresApproval: z.boolean(),
    write: z.number().int().min(0).max(200),
  })
  .strict();

export const AssistantWorkflowDraftSummarySchema = z
  .object({
    conversationId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    id: z.string().uuid(),
    messageId: z.string().uuid(),
    name: z.string().min(1).max(160),
    nodeCount: z.number().int().min(1).max(200),
    risk: AssistantWorkflowRiskCountsSchema,
    status: z.literal('draft'),
    version: z.literal(1),
    workflowId: z.string().uuid(),
    workflowVersionId: z.string().uuid(),
  })
  .strict();
export type AssistantWorkflowDraftSummary = z.infer<typeof AssistantWorkflowDraftSummarySchema>;

export const AssistantWorkflowDraftCreateRequestSchema = z
  .object({
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
  })
  .strict();

export const AssistantWorkflowDraftCreateResponseSchema = z
  .object({ draft: AssistantWorkflowDraftSummarySchema })
  .strict();

export const AssistantWorkflowRunCreateResponseSchema = z
  .object({
    draft: AssistantWorkflowDraftSummarySchema,
    duplicate: z.boolean(),
    run: WorkflowRunViewSchema,
  })
  .strict();
