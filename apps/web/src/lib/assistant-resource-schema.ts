import {
  AssistantResourceMimeTypeSchema,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from '@ai-workflow-studio/tool-registry';
import { z } from 'zod';

import { AiModelSelectionSchema } from '@/lib/ai-model-selection';

export const AssistantAttachmentSummarySchema = z
  .object({
    byteSize: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
    conversationId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    filename: z.string().min(1).max(180),
    id: z.string().uuid(),
    mimeType: AssistantResourceMimeTypeSchema,
    preview: z.string().max(640),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type AssistantAttachmentSummary = z.infer<typeof AssistantAttachmentSummarySchema>;

export const AssistantArtifactSummarySchema = z
  .object({
    byteSize: z.number().int().min(1).max(80_000),
    conversationId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    filename: z.string().min(1).max(180),
    id: z.string().uuid(),
    messageId: z.string().uuid(),
    mimeType: z.literal('text/markdown'),
    preview: z.string().max(1_200),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceCount: z.number().int().min(0).max(MAX_ATTACHMENTS_PER_MESSAGE),
    title: z.string().min(1).max(120),
  })
  .strict();
export type AssistantArtifactSummary = z.infer<typeof AssistantArtifactSummarySchema>;

export const AssistantResourcesResponseSchema = z
  .object({
    artifacts: z.array(AssistantArtifactSummarySchema).max(100),
    attachments: z.array(AssistantAttachmentSummarySchema).max(20),
  })
  .strict();

export const AssistantAttachmentUploadRequestSchema = z
  .object({
    content: z.string().min(1).max(MAX_ATTACHMENT_BYTES),
    conversationId: z.string().uuid(),
    filename: z.string().min(1).max(240),
    mimeType: z.string().max(120).default(''),
  })
  .strict();

export const AssistantArtifactCreateRequestSchema = z
  .object({
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
    sourceAttachmentIds: z
      .array(z.string().uuid())
      .max(MAX_ATTACHMENTS_PER_MESSAGE)
      .refine((ids) => new Set(ids).size === ids.length, 'Attachment IDs must be unique.'),
    title: z.string().trim().min(1).max(120),
  })
  .strict();

export const AssistantConversationCreateRequestSchema = z
  .object({
    mode: z.enum(['ask', 'plan']),
    provider: AiModelSelectionSchema.shape.provider,
    tier: AiModelSelectionSchema.shape.tier.default('auto'),
    title: z.string().trim().min(1).max(160),
  })
  .strict();
