import { describe, expect, it } from 'vitest';

import {
  AssistantImageGenerationRequestSchema,
  AssistantImageGenerationResponseSchema,
} from './assistant-image-schema';

describe('assistant image schemas', () => {
  it('accepts a bounded exact-model image request', () => {
    expect(
      AssistantImageGenerationRequestSchema.parse({
        locale: 'zh-Hant',
        prompt: '產生一張時尚專業的 AI 自動化工作流程主視覺',
        provider: 'gemini',
        tier: 'economy',
      }),
    ).toMatchObject({ provider: 'gemini', tier: 'economy' });
  });

  it('rejects a response that does not contain validated PNG metadata', () => {
    expect(() =>
      AssistantImageGenerationResponseSchema.parse({
        assistantMessage: {
          body: 'Image generated.',
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          image: {
            alt: 'unsafe',
            byteSize: 12,
            height: 1,
            id: crypto.randomUUID(),
            mimeType: 'image/jpeg',
            model: 'model',
            provider: 'mock',
            width: 1,
          },
          model: 'mock-image-v1',
          provider: 'mock',
          role: 'assistant',
          status: 'completed',
        },
        conversationId: crypto.randomUUID(),
        image: {},
        userMessage: {},
      }),
    ).toThrow();
  });
});
