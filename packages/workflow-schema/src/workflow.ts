import { z } from 'zod';

import { WorkflowNodeSchema } from './node-configs';

const UuidSchema = z.string().uuid();
const CronSchema = z
  .string()
  .trim()
  .max(120)
  .regex(/^(\S+\s+){4}\S+$/, 'Cron must contain exactly five fields');
const TimezoneSchema = z
  .string()
  .trim()
  .max(100)
  .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/, 'Timezone must be an IANA-style identifier');
const FilePatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (pattern) => !pattern.includes('/') && !pattern.includes('\\') && !pattern.includes('..'),
    'File pattern must not contain paths or traversal segments',
  );

export const ExecutionTargetSchema = z.discriminatedUnion('type', [
  z
    .object({
      deviceId: UuidSchema,
      type: z.literal('desktop'),
    })
    .strict(),
  z
    .object({
      type: z.literal('cloud'),
    })
    .strict(),
]);

export const TriggerSchema = z.discriminatedUnion('type', [
  z
    .object({
      config: z.object({}).strict(),
      type: z.literal('manual.trigger'),
    })
    .strict(),
  z
    .object({
      config: z
        .object({
          cron: CronSchema,
          timezone: TimezoneSchema,
        })
        .strict(),
      type: z.literal('schedule.trigger'),
    })
    .strict(),
  z
    .object({
      config: z
        .object({
          folderAliasId: UuidSchema,
          pattern: FilePatternSchema.default('*.xlsx'),
        })
        .strict(),
      type: z.literal('folder.file_created'),
    })
    .strict(),
  z
    .object({
      config: z
        .object({
          debounceMs: z.number().int().min(250).max(60_000).default(1_000),
          folderAliasId: UuidSchema,
          pattern: FilePatternSchema.default('*.xlsx'),
        })
        .strict(),
      type: z.literal('folder.file_changed'),
    })
    .strict(),
]);

export const WorkflowEdgeSchema = z
  .object({
    from: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    to: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  })
  .strict();

export const WorkflowSchema = z
  .object({
    description: z.string().trim().max(1_000).default(''),
    edges: z.array(WorkflowEdgeSchema).max(500),
    executionTarget: ExecutionTargetSchema,
    name: z.string().trim().min(1).max(160),
    nodes: z.array(WorkflowNodeSchema).min(1).max(200),
    schemaVersion: z.literal(1),
    trigger: TriggerSchema,
  })
  .strict();

export type ExecutionTarget = z.infer<typeof ExecutionTargetSchema>;
export type Trigger = z.infer<typeof TriggerSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
