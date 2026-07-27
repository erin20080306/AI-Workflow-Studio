import { AiGatewayError } from './errors';
import type {
  AiChatAdapter,
  ChatGatewayEvent,
  ChatMessage,
  ChatRequest,
  ProviderTokenUsage,
  UsageSink,
} from './types';
import { ChatRequestSchema } from './types';
import { recordUsage } from './usage';

const MAX_CONTEXT_CHARACTERS = 48_000;
const MAX_STREAM_CHARACTERS = 80_000;

export const CHAT_SYSTEM_PROMPT = [
  'You are AI Workflow Studio, a bilingual assistant for safe business automation planning.',
  'Answer the user directly and clearly in their requested locale.',
  'Do not claim that you executed tools, changed files, sent messages, or published anything.',
  'Do not provide executable shell commands, secrets, credentials, or hidden chain-of-thought.',
  'If the user requests automation, explain the approach and suggest Plan mode for validated Workflow JSON.',
].join(' ');

export function boundChatMessages(messages: readonly ChatMessage[]): readonly ChatMessage[] {
  const bounded: ChatMessage[] = [];
  let characters = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined || characters + message.content.length > MAX_CONTEXT_CHARACTERS) {
      break;
    }
    bounded.unshift(message);
    characters += message.content.length;
  }

  if (bounded.length === 0) {
    throw new AiGatewayError(
      'AI_REQUEST_INVALID',
      'The latest chat message exceeds context limits.',
    );
  }
  return bounded;
}

export class AiChatGateway {
  constructor(
    private readonly adapter: AiChatAdapter,
    private readonly usageSink: UsageSink,
  ) {}

  async *stream(input: unknown, signal?: AbortSignal): AsyncIterable<ChatGatewayEvent> {
    const parsed = ChatRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiGatewayError('AI_REQUEST_INVALID', 'AI chat request is invalid.', {
        details: {
          paths: parsed.error.issues.map((issue) => issue.path.map(String).join('.')),
        },
      });
    }

    const request: ChatRequest = parsed.data;
    const messages = boundChatMessages(request.messages);
    const startedAt = Date.now();
    let outputCharacters = 0;
    let finalUsage: ProviderTokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    let finalModel = this.adapter.model;
    let completed = false;

    try {
      for await (const event of this.adapter.streamChat({
        chatRequest: request,
        messages,
        ...(signal === undefined ? {} : { signal }),
        systemPrompt: CHAT_SYSTEM_PROMPT,
      })) {
        if (event.type === 'delta') {
          outputCharacters += event.text.length;
          if (outputCharacters > MAX_STREAM_CHARACTERS) {
            throw new AiGatewayError(
              'AI_PROVIDER_RESPONSE_INVALID',
              'AI provider output exceeded the maximum accepted size.',
            );
          }
          yield event;
          continue;
        }

        completed = true;
        finalModel = event.model;
        finalUsage = event.usage;
        await recordUsage(this.usageSink, {
          attempt: 1,
          durationMs: Math.max(0, Date.now() - startedAt),
          inputTokens: event.usage.inputTokens,
          model: event.model,
          operation: 'chat',
          outcome: 'succeeded',
          outputTokens: event.usage.outputTokens,
          provider: this.adapter.provider,
          validationCodes: [],
        });
        yield {
          ...event,
          provider: this.adapter.provider,
        };
      }

      if (!completed) {
        throw new AiGatewayError(
          'AI_PROVIDER_RESPONSE_INVALID',
          'AI provider stream ended without a completion event.',
        );
      }
    } catch (error) {
      if (!completed) {
        await recordUsage(this.usageSink, {
          attempt: 1,
          durationMs: Math.max(0, Date.now() - startedAt),
          inputTokens: finalUsage.inputTokens,
          model: finalModel,
          operation: 'chat',
          outcome:
            error instanceof AiGatewayError && error.code === 'AI_PROVIDER_CANCELLED'
              ? 'cancelled'
              : 'failed',
          outputTokens: finalUsage.outputTokens,
          provider: this.adapter.provider,
          validationCodes: [],
        });
      }
      throw error;
    }
  }
}
