import { describe, expect, it } from 'vitest';

import { AiChatGateway, boundChatMessages } from './chat';
import { MockAiAdapter } from './providers/mock';
import type { ChatGatewayEvent } from './types';
import { InMemoryUsageSink } from './usage';

describe('AiChatGateway', () => {
  it('streams provider-neutral deltas and records redacted usage', async () => {
    const usage = new InMemoryUsageSink();
    const events: ChatGatewayEvent[] = [];
    const prompt = '請協助我釐清每日訂單彙整的安全步驟。';

    for await (const event of new AiChatGateway(new MockAiAdapter(), usage).stream({
      locale: 'zh-Hant',
      maxOutputTokens: 512,
      messages: [{ content: prompt, role: 'user' }],
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === 'delta')).toBe(true);
    expect(events.at(-1)).toMatchObject({
      model: 'mock-chat-v1',
      provider: 'mock',
      type: 'done',
    });
    expect(usage.records).toMatchObject([
      {
        operation: 'chat',
        outcome: 'succeeded',
        provider: 'mock',
      },
    ]);
    expect(JSON.stringify(usage.records)).not.toContain(prompt);
  });

  it('bounds continuation context from the newest complete messages', () => {
    const messages = Array.from({ length: 8 }, (_, index) => ({
      content: `${index}`.repeat(8_000),
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    }));

    const bounded = boundChatMessages(messages);

    expect(bounded).toHaveLength(6);
    expect(bounded[0]?.content.startsWith('2')).toBe(true);
    expect(bounded.at(-1)?.content.startsWith('7')).toBe(true);
  });

  it('rejects invalid chat input before the provider is called', async () => {
    const gateway = new AiChatGateway(new MockAiAdapter(), new InMemoryUsageSink());
    const iterator = gateway.stream({ messages: [] })[Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toMatchObject({ code: 'AI_REQUEST_INVALID' });
  });
});
