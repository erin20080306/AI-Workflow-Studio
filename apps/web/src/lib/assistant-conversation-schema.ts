import { AIPlannerOutputSchema } from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

import { AiProviderNameSchema } from '@ai-workflow-studio/ai-gateway';

export const AssistantConversationModeSchema = z.enum(['ask', 'plan']);
export type AssistantConversationMode = z.infer<typeof AssistantConversationModeSchema>;

export const AssistantMessageStatusSchema = z.enum(['cancelled', 'completed', 'failed']);

export const AssistantConversationSummarySchema = z
  .object({
    id: z.string().uuid(),
    lastMessageAt: z.string().datetime({ offset: true }),
    mode: AssistantConversationModeSchema,
    model: z.string().min(1).max(120),
    provider: AiProviderNameSchema,
    status: z.enum(['active', 'archived']),
    title: z.string().min(1).max(160),
  })
  .strict();

export type AssistantConversationSummary = z.infer<typeof AssistantConversationSummarySchema>;

export const AssistantConversationMessageSchema = z
  .object({
    body: z.string().min(1).max(80_000),
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    model: z.string().min(1).max(120).optional(),
    plan: AIPlannerOutputSchema.optional(),
    provider: AiProviderNameSchema.optional(),
    role: z.enum(['assistant', 'user']),
    status: AssistantMessageStatusSchema,
  })
  .strict();

export type AssistantConversationMessage = z.infer<typeof AssistantConversationMessageSchema>;

export const AssistantConversationSchema = AssistantConversationSummarySchema.extend({
  messages: z.array(AssistantConversationMessageSchema).max(200),
}).strict();

export type AssistantConversation = z.infer<typeof AssistantConversationSchema>;

export const AssistantConversationListResponseSchema = z
  .object({
    conversations: z.array(AssistantConversationSummarySchema).max(100),
  })
  .strict();

export const AssistantConversationResponseSchema = z
  .object({
    conversation: AssistantConversationSchema,
  })
  .strict();

export const AssistantChatStreamEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      conversationId: z.string().uuid(),
      type: z.literal('meta'),
      userMessage: AssistantConversationMessageSchema,
    })
    .strict(),
  z.object({ text: z.string().min(1), type: z.literal('delta') }).strict(),
  z
    .object({
      message: AssistantConversationMessageSchema,
      type: z.literal('done'),
    })
    .strict(),
  z
    .object({
      code: z.string().min(1).max(80),
      message: z.string().min(1).max(240),
      partialMessage: AssistantConversationMessageSchema.optional(),
      type: z.literal('error'),
    })
    .strict(),
]);

export type AssistantChatStreamEvent = z.infer<typeof AssistantChatStreamEventSchema>;
