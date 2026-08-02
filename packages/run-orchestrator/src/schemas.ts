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

const RunStepViewSchema = StepResultSchema.omit({ output: true })
  .extend({
    attempt: z.number().int().min(1).max(100),
    currentAction: z
      .enum([
        'excel.autofit_used_range',
        'excel.open_workbook',
        'excel.save_workbook',
        'excel.verify_active_workbook',
      ])
      .optional(),
    nodeType: z.string().min(1).max(120),
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
