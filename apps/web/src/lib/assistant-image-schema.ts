import { z } from 'zod';

import {
  AssistantConversationMessageSchema,
  AssistantImageSummarySchema,
} from './assistant-conversation-schema';
import { AiModelSelectionSchema } from './ai-model-selection';

export const AssistantImageGenerationRequestSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    locale: z.enum(['en', 'zh-Hant']),
    prompt: z.string().trim().min(10).max(1_200),
    provider: AiModelSelectionSchema.shape.provider,
    tier: AiModelSelectionSchema.shape.tier.default('auto'),
  })
  .strict();

export const AssistantImageGenerationResponseSchema = z
  .object({
    assistantMessage: AssistantConversationMessageSchema,
    conversationId: z.string().uuid(),
    image: AssistantImageSummarySchema,
    userMessage: AssistantConversationMessageSchema,
  })
  .strict();
