import { AiGatewayError, AiProviderNameSchema } from '@ai-workflow-studio/ai-gateway';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  type PreparedSource,
} from '@ai-workflow-studio/tool-registry';
import { z } from 'zod';

import { assistantErrorDetails, readAssistantJson } from '@/lib/assistant-api';
import type {
  AssistantConversationMessage,
  AssistantConversationSummary,
} from '@/lib/assistant-conversation-schema';
import {
  appendAssistantMessage,
  createAssistantUsageSink,
  ensureAssistantConversation,
  getAssistantConversation,
} from '@/lib/assistant-conversation-server';
import { prepareAssistantSources } from '@/lib/assistant-resource-server';
import { requireWorkspaceContext, type WorkspaceContext } from '@/lib/auth/context';
import { plannerAccessDecision } from '@/lib/control-plane-access';
import { getEnvironment } from '@/lib/env';
import { createServerAiChatGateway } from '@/lib/ai-gateway';

const ChatApiRequestSchema = z
  .object({
    attachmentIds: z.array(z.string().uuid()).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
    conversationId: z.string().uuid().optional(),
    locale: z.enum(['en', 'zh-Hant']).default('zh-Hant'),
    message: z.string().trim().min(2).max(12_000),
    provider: AiProviderNameSchema,
  })
  .strict();

function eventData(value: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
}

export async function POST(request: Request): Promise<Response> {
  let input: z.infer<typeof ChatApiRequestSchema>;
  let workspace: WorkspaceContext;
  try {
    input = ChatApiRequestSchema.parse(await readAssistantJson(request));
    workspace = await requireWorkspaceContext();
    const access = plannerAccessDecision(
      getEnvironment().mockMode,
      input.provider,
      workspace !== null,
    );
    if (!access.allowed) {
      return Response.json(
        { error: { code: access.code, message: access.message } },
        { headers: { 'cache-control': 'no-store' }, status: access.status },
      );
    }
  } catch (error) {
    const safe = assistantErrorDetails(error);
    return Response.json(
      { error: { code: safe.code, message: safe.message } },
      { headers: { 'cache-control': 'no-store' }, status: safe.status },
    );
  }

  const environment = getEnvironment();
  const model = environment.providerModels[input.provider];
  let conversation: AssistantConversationSummary;
  let userMessage: AssistantConversationMessage;
  let sources: readonly PreparedSource[];
  try {
    conversation = await ensureAssistantConversation(workspace, {
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
      mode: 'ask',
      model,
      provider: input.provider,
      title: input.message,
    });
    userMessage = await appendAssistantMessage(workspace, {
      body: input.message,
      conversationId: conversation.id,
      role: 'user',
    });
    sources = await prepareAssistantSources(workspace, {
      attachmentIds: input.attachmentIds,
      conversationId: conversation.id,
      maxCharacters: 16_000,
      messageId: userMessage.id,
    });
  } catch (error) {
    const safe = assistantErrorDetails(error);
    return Response.json(
      { error: { code: safe.code, message: safe.message } },
      { headers: { 'cache-control': 'no-store' }, status: safe.status },
    );
  }

  const abortController = new AbortController();
  const requestAbortListener = () => abortController.abort('client_disconnected');
  request.signal.addEventListener('abort', requestAbortListener, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      abortController.abort('client_cancelled');
    },
    start(controller) {
      const execute = async (): Promise<void> => {
        let responseText = '';
        controller.enqueue(
          eventData({
            conversationId: conversation.id,
            type: 'meta',
            userMessage,
          }),
        );

        try {
          const persisted = await getAssistantConversation(workspace, conversation.id);
          const history = persisted.messages
            .filter((message) => message.status === 'completed')
            .slice(-40)
            .map((message) => ({ content: message.body, role: message.role }));
          const gateway = createServerAiChatGateway(
            input.provider,
            createAssistantUsageSink(workspace, conversation.id),
          );

          for await (const event of gateway.stream(
            {
              locale: input.locale,
              maxOutputTokens: 2_048,
              messages: history,
              sources,
            },
            abortController.signal,
          )) {
            if (event.type === 'delta') {
              responseText += event.text;
              controller.enqueue(eventData(event));
              continue;
            }

            const message = await appendAssistantMessage(workspace, {
              body: responseText || 'No response content was returned.',
              conversationId: conversation.id,
              inputUnits: event.usage.inputTokens,
              model: event.model,
              outputUnits: event.usage.outputTokens,
              provider: event.provider,
              role: 'assistant',
            });
            controller.enqueue(eventData({ message, type: 'done' }));
          }
        } catch (error) {
          const safe = assistantErrorDetails(error);
          const status =
            error instanceof AiGatewayError && error.code === 'AI_PROVIDER_CANCELLED'
              ? 'cancelled'
              : 'failed';
          let partialMessage: AssistantConversationMessage | undefined;
          try {
            partialMessage = await appendAssistantMessage(workspace, {
              body:
                responseText.trim().length > 0
                  ? responseText
                  : input.locale === 'en'
                    ? 'The assistant response could not be completed.'
                    : '助理回應未能完成。',
              conversationId: conversation.id,
              model,
              provider: input.provider,
              role: 'assistant',
              status,
            });
          } catch {
            partialMessage = undefined;
          }
          if (!abortController.signal.aborted) {
            controller.enqueue(
              eventData({
                code: safe.code,
                message: safe.message,
                ...(partialMessage === undefined ? {} : { partialMessage }),
                type: 'error',
              }),
            );
          }
        } finally {
          request.signal.removeEventListener('abort', requestAbortListener);
          try {
            controller.close();
          } catch {
            // The browser may already have cancelled the stream.
          }
        }
      };
      void execute();
    },
  });

  return new Response(stream, {
    headers: {
      'cache-control': 'no-cache, no-store',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
    },
  });
}

export const runtime = 'nodejs';
