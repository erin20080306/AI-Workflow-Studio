import {
  NODE_CATALOG_BY_TYPE,
  StepResultSchema,
  type WorkflowNodeType,
} from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

import type { WorkflowRunView } from './types';

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime({ offset: true });
const NodeTypeSchema = z.custom<WorkflowNodeType>(
  (value) => typeof value === 'string' && NODE_CATALOG_BY_TYPE.has(value as WorkflowNodeType),
  'Unknown workflow node type.',
);

const RiskNodeSummarySchema = z
  .object({
    approvalMode: z.enum(['always', 'first_run', 'none']),
    description: z.string().min(1).max(500),
    nodeId: z.string().min(1).max(120),
    riskLevel: z.enum(['destructive', 'external', 'read', 'write']),
    type: NodeTypeSchema,
  })
  .strict();

const WorkflowRiskSummarySchema = z
  .object({
    destructive: z.array(RiskNodeSummarySchema).max(200),
    external: z.array(RiskNodeSummarySchema).max(200),
    read: z.array(RiskNodeSummarySchema).max(200),
    requiresApproval: z.boolean(),
    write: z.array(RiskNodeSummarySchema).max(200),
  })
  .strict();

const RunApprovalSchema = z
  .object({
    expiresAt: TimestampSchema,
    id: UuidSchema,
    requestedAt: TimestampSchema,
    requestedBy: UuidSchema,
    resolvedAt: TimestampSchema.optional(),
    resolvedBy: UuidSchema.optional(),
    riskSummary: WorkflowRiskSummarySchema,
    status: z.enum(['approved', 'expired', 'pending', 'rejected']),
  })
  .strict();

const RunAuditEntrySchema = z
  .object({
    action: z.string().min(1).max(160),
    actorId: z.string().min(1).max(160).optional(),
    actorType: z.enum(['device', 'system', 'user']),
    createdAt: TimestampSchema,
    id: UuidSchema,
    metadata: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  })
  .strict();

const RunNotificationSchema = z
  .object({
    createdAt: TimestampSchema,
    id: UuidSchema,
    kind: z.enum(['approval', 'error', 'info', 'success']),
    message: z.string().min(1).max(500),
    read: z.boolean(),
    title: z.string().min(1).max(160),
  })
  .strict();

const GoogleResourceIdSchema = z
  .string()
  .min(8)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/);

export const RunStepResultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('ai_summary'),
      model: z.string().min(1).max(160),
      provider: z.enum(['anthropic', 'gemini', 'mock', 'openai']),
      text: z.string().max(20_000),
    })
    .strict(),
  z
    .object({
      content: z.string().max(80_000),
      format: z.enum(['html', 'markdown']),
      includeReferences: z.boolean(),
      kind: z.literal('business_report'),
      title: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      kind: z.literal('google_slides_presentation'),
      presentationId: GoogleResourceIdSchema,
      slideCount: z.number().int().min(1).max(30),
      url: z
        .url()
        .refine((value) =>
          /^https:\/\/docs\.google\.com\/presentation\/d\/[A-Za-z0-9_-]+\/edit$/u.test(value),
        ),
    })
    .strict(),
  z
    .object({
      deploymentId: GoogleResourceIdSchema,
      kind: z.literal('apps_script_deployment'),
      requiredScopes: z.array(z.url().max(2_000)).max(20).optional(),
      scriptId: GoogleResourceIdSchema,
      versionNumber: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      files: z
        .array(
          z
            .object({
              name: z.string().min(1).max(80),
              source: z.string().max(20_000),
            })
            .strict(),
        )
        .max(6),
      kind: z.literal('apps_script_manual'),
      requiredScopes: z.array(z.string().max(2_000)).max(20),
      steps: z.array(z.string().min(1).max(400)).max(12),
      template: z.string().min(1).max(80),
      title: z.string().min(1).max(200),
    })
    .strict(),
]);

const RunStepViewSchema = StepResultSchema.omit({ output: true })
  .extend({
    attempt: z.number().int().min(1).max(100),
    currentAction: z
      .enum([
        'drive.download_items',
        'drive.open_folder',
        'drive.select_items',
        'drive.verify_download',
        'excel.autofit_used_range',
        'excel.open_workbook',
        'excel.save_workbook',
        'excel.verify_active_workbook',
      ])
      .optional(),
    driveWorkbookProgress: z
      .discriminatedUnion('phase', [
        z.object({ phase: z.literal('scanning') }).strict(),
        z
          .object({
            phase: z.literal('batching'),
            totalWorkbookCount: z.number().int().min(1).max(1_000),
          })
          .strict(),
      ])
      .optional(),
    nodeType: z.string().min(1).max(120),
    result: RunStepResultSchema.optional(),
  })
  .strict();

export const WorkflowRunViewSchema = z
  .object({
    approval: RunApprovalSchema.optional(),
    attempts: z.number().int().min(0).max(100),
    audit: z.array(RunAuditEntrySchema).max(2_000),
    completedAt: TimestampSchema.optional(),
    createdAt: TimestampSchema,
    deviceId: UuidSchema.optional(),
    error: z
      .object({
        code: z.string().min(1).max(120),
        message: z.string().min(1).max(500),
        retryable: z.boolean(),
      })
      .strict()
      .optional(),
    id: UuidSchema,
    idempotencyKey: z.string().min(8).max(200),
    jobId: UuidSchema.optional(),
    maxAttempts: z.number().int().min(1).max(100),
    notifications: z.array(RunNotificationSchema).max(2_000),
    startedAt: TimestampSchema.optional(),
    status: z.enum([
      'awaiting_approval',
      'cancelled',
      'failed',
      'queued',
      'running',
      'succeeded',
      'timed_out',
    ]),
    steps: z.array(RunStepViewSchema).max(200),
    tenantId: UuidSchema,
    timeoutAt: TimestampSchema,
    workflowId: UuidSchema,
    workflowName: z.string().min(1).max(160),
    workflowVersionId: UuidSchema,
  })
  .strict() as unknown as z.ZodType<WorkflowRunView>;
