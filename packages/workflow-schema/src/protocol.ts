import { z } from 'zod';

import { JsonValueSchema } from './json';
import { WorkflowSchema } from './workflow';

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime({ offset: true });

export const StepResultSchema = z
  .object({
    completedAt: TimestampSchema.optional(),
    error: z
      .object({
        code: z.string().min(1).max(120),
        message: z.string().min(1).max(500),
        retryable: z.boolean(),
      })
      .strict()
      .optional(),
    nodeId: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    output: JsonValueSchema.optional(),
    processedFileCount: z.number().int().min(0).default(0),
    processedRowCount: z.number().int().min(0).default(0),
    startedAt: TimestampSchema.optional(),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled']),
  })
  .strict();

export const WorkflowRunSchema = z
  .object({
    completedAt: TimestampSchema.optional(),
    dryRun: z.boolean().default(false),
    id: UuidSchema,
    idempotencyKey: z.string().min(8).max(200),
    startedAt: TimestampSchema.optional(),
    status: z.enum([
      'pending',
      'awaiting_approval',
      'queued',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'timed_out',
    ]),
    steps: z.array(StepResultSchema).max(200).default([]),
    tenantId: UuidSchema,
    workflowId: UuidSchema,
    workflowVersionId: UuidSchema,
  })
  .strict();

export const AgentJobSchema = z
  .object({
    attempt: z.number().int().min(0).default(0),
    availableAt: TimestampSchema,
    deviceId: UuidSchema,
    id: UuidSchema,
    idempotencyKey: z.string().min(8).max(200),
    leaseExpiresAt: TimestampSchema.optional(),
    maxAttempts: z.number().int().min(1).max(20).default(3),
    status: z.enum([
      'pending',
      'claimed',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'expired',
    ]),
    tenantId: UuidSchema,
    workflow: WorkflowSchema,
    workflowRunId: UuidSchema,
  })
  .strict();

export const AgentHeartbeatSchema = z
  .object({
    agentVersion: z.string().min(1).max(80),
    deviceId: UuidSchema,
    executorRunning: z.boolean(),
    occurredAt: TimestampSchema,
    requestTimestamp: TimestampSchema,
    tenantId: UuidSchema,
  })
  .strict();

export const MappingProposalSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1).max(500),
    sourceColumn: z.string().min(1).max(200),
    targetColumn: z.string().min(1).max(200),
  })
  .strict();

export const AIPlannerOutputSchema = z
  .object({
    assumptions: z.array(z.string().min(1).max(500)).max(20).default([]),
    explanation: z.string().min(1).max(4_000),
    mappingProposals: z.array(MappingProposalSchema).max(100).default([]),
    workflow: WorkflowSchema,
  })
  .strict();

export type AgentHeartbeat = z.infer<typeof AgentHeartbeatSchema>;
export type AgentJob = z.infer<typeof AgentJobSchema>;
export type AIPlannerOutput = z.infer<typeof AIPlannerOutputSchema>;
export type StepResult = z.infer<typeof StepResultSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
