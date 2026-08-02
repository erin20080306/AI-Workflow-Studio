import {
  AgentJobSchema,
  JsonValueSchema,
  StepResultSchema,
} from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

const EventIdSchema = z.string().uuid();
const LeaseSecondsSchema = z.number().int().min(30).max(120).default(60);

export const PairStartRequestSchema = z
  .object({
    deviceName: z.string().trim().min(1).max(120),
  })
  .strict();

export const PairCompleteRequestSchema = z
  .object({
    agentVersion: z.string().trim().min(1).max(80),
    pairingCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/),
  })
  .strict();

export const HeartbeatRequestSchema = z
  .object({
    agentVersion: z.string().trim().min(1).max(80),
    executorRunning: z.boolean(),
    metadata: z.record(z.string(), JsonValueSchema).default({}),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value.metadata).length > 20) {
      context.addIssue({
        code: 'custom',
        message: 'Heartbeat metadata may contain at most 20 keys.',
        path: ['metadata'],
      });
    }
  });

export const ClaimJobRequestSchema = z
  .object({
    leaseSeconds: LeaseSecondsSchema,
  })
  .strict();

export const LeaseJobRequestSchema = ClaimJobRequestSchema;

export const ProgressJobRequestSchema = z
  .object({
    eventId: EventIdSchema,
    step: StepResultSchema,
  })
  .strict();

export const CompleteJobRequestSchema = z
  .object({
    eventId: EventIdSchema,
    result: JsonValueSchema.optional(),
  })
  .strict();

export const AgentCloudStepRequestSchema = z
  .object({
    input: JsonValueSchema,
  })
  .strict();

export const AgentCloudStepResponseSchema = z
  .object({
    duplicate: z.boolean(),
    output: JsonValueSchema,
    processedFileCount: z.number().int().nonnegative().default(0),
    processedRowCount: z.number().int().nonnegative().default(0),
  })
  .strict();

export const FailJobRequestSchema = z
  .object({
    error: z
      .object({
        code: z.string().trim().min(1).max(120),
        message: z.string().trim().min(1).max(500),
        retryable: z.boolean(),
      })
      .strict(),
    eventId: EventIdSchema,
  })
  .strict();

export const AgentJobListSchema = z.array(AgentJobSchema).max(100);

export type ClaimJobRequest = z.infer<typeof ClaimJobRequestSchema>;
export type AgentCloudStepRequest = z.infer<typeof AgentCloudStepRequestSchema>;
export type AgentCloudStepResponse = z.infer<typeof AgentCloudStepResponseSchema>;
export type CompleteJobRequest = z.infer<typeof CompleteJobRequestSchema>;
export type FailJobRequest = z.infer<typeof FailJobRequestSchema>;
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;
export type LeaseJobRequest = z.infer<typeof LeaseJobRequestSchema>;
export type PairCompleteRequest = z.infer<typeof PairCompleteRequestSchema>;
export type PairStartRequest = z.infer<typeof PairStartRequestSchema>;
export type ProgressJobRequest = z.infer<typeof ProgressJobRequestSchema>;
export type { AgentJob } from '@ai-workflow-studio/workflow-schema';
