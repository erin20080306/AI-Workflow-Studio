import 'server-only';

import {
  AiProviderNameSchema,
  type AiProviderName,
  type UsageRecord,
  type UsageSink,
} from '@ai-workflow-studio/ai-gateway';
import { AIPlannerOutputSchema, type AIPlannerOutput } from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

import {
  AssistantConversationMessageSchema,
  AssistantConversationModeSchema,
  AssistantConversationSchema,
  AssistantConversationSummarySchema,
  AssistantImageSummarySchema,
  AssistantMessageStatusSchema,
  type AssistantConversation,
  type AssistantConversationMessage,
  type AssistantConversationMode,
  type AssistantConversationSummary,
  type AssistantImageSummary,
} from '@/lib/assistant-conversation-schema';
import { deleteMemoryAssistantImages } from '@/lib/assistant-image-server';
import {
  aggregateAssistantUsageRecords,
  shouldSettleAssistantUsage,
} from '@/lib/assistant-usage-settlement';
import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import {
  type AssistantUsageReservation,
  recordReservedAssistantUsage,
} from '@/lib/usage-control-server';

const ConversationRowSchema = z.object({
  created_at: z.string().datetime({ offset: true }),
  created_by: z.string().uuid(),
  id: z.string().uuid(),
  last_message_at: z.string().datetime({ offset: true }),
  mode: AssistantConversationModeSchema,
  selected_model: z.string().min(1).max(120),
  selected_provider: AiProviderNameSchema,
  status: z.enum(['active', 'archived']),
  tenant_id: z.string().uuid(),
  title: z.string().min(1).max(160),
  updated_at: z.string().datetime({ offset: true }),
});

const MessageRowSchema = z.object({
  body: z.string().min(1).max(80_000),
  conversation_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  created_by: z.string().uuid().nullable(),
  id: z.string().uuid(),
  input_units: z.number().int().min(0),
  metadata: z.record(z.string(), z.unknown()),
  model: z.string().min(1).max(120).nullable(),
  output_units: z.number().int().min(0),
  provider: AiProviderNameSchema.nullable(),
  role: z.enum(['assistant', 'user']),
  status: AssistantMessageStatusSchema,
  tenant_id: z.string().uuid(),
});

export type AssistantPersistenceErrorCode =
  'ASSISTANT_CONVERSATION_NOT_FOUND' | 'ASSISTANT_PERSISTENCE_FAILED';

export class AssistantPersistenceError extends Error {
  readonly code: AssistantPersistenceErrorCode;

  constructor(code: AssistantPersistenceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'AssistantPersistenceError';
  }
}

interface MemoryConversation {
  readonly createdAt: string;
  readonly createdBy: string;
  readonly id: string;
  lastMessageAt: string;
  messages: AssistantConversationMessage[];
  mode: AssistantConversationMode;
  model: string;
  provider: AiProviderName;
  status: 'active' | 'archived';
  readonly tenantId: string;
  title: string;
}

interface MemoryState {
  readonly conversations: Map<string, MemoryConversation>;
  readonly usage: UsageRecord[];
}

const assistantGlobal = globalThis as typeof globalThis & {
  __aiWorkflowAssistantState?: MemoryState;
};

function memoryState(): MemoryState {
  assistantGlobal.__aiWorkflowAssistantState ??= {
    conversations: new Map(),
    usage: [],
  };
  return assistantGlobal.__aiWorkflowAssistantState;
}

function safeTitle(value: string): string {
  const normalized = value.trim().replaceAll(/\s+/g, ' ');
  return [...normalized].slice(0, 72).join('') || 'New conversation';
}

function conversationSummary(row: z.infer<typeof ConversationRowSchema>) {
  return AssistantConversationSummarySchema.parse({
    id: row.id,
    lastMessageAt: row.last_message_at,
    mode: row.mode,
    model: row.selected_model,
    provider: row.selected_provider,
    status: row.status,
    title: row.title,
  });
}

function messageView(row: z.infer<typeof MessageRowSchema>): AssistantConversationMessage {
  const plan = AIPlannerOutputSchema.safeParse(row.metadata.plan);
  const image = AssistantImageSummarySchema.safeParse(row.metadata.image);
  return AssistantConversationMessageSchema.parse({
    body: row.body,
    createdAt: row.created_at,
    id: row.id,
    ...(image.success ? { image: image.data } : {}),
    ...(row.model === null ? {} : { model: row.model }),
    ...(plan.success ? { plan: plan.data } : {}),
    ...(row.provider === null ? {} : { provider: row.provider }),
    role: row.role,
    status: row.status,
  });
}

function memorySummary(conversation: MemoryConversation): AssistantConversationSummary {
  return AssistantConversationSummarySchema.parse({
    id: conversation.id,
    lastMessageAt: conversation.lastMessageAt,
    mode: conversation.mode,
    model: conversation.model,
    provider: conversation.provider,
    status: conversation.status,
    title: conversation.title,
  });
}

function requireMemoryConversation(
  context: WorkspaceContext,
  conversationId: string,
): MemoryConversation {
  const conversation = memoryState().conversations.get(conversationId);
  if (conversation === undefined || conversation.tenantId !== context.actor.tenantId) {
    throw new AssistantPersistenceError(
      'ASSISTANT_CONVERSATION_NOT_FOUND',
      'The AI conversation was not found.',
    );
  }
  return conversation;
}

export async function ensureAssistantConversation(
  context: WorkspaceContext,
  input: {
    readonly conversationId?: string;
    readonly mode: AssistantConversationMode;
    readonly model: string;
    readonly provider: AiProviderName;
    readonly title: string;
  },
): Promise<AssistantConversationSummary> {
  if (getEnvironment().mockMode) {
    if (input.conversationId !== undefined) {
      const conversation = requireMemoryConversation(context, input.conversationId);
      conversation.mode = input.mode;
      conversation.model = input.model;
      conversation.provider = input.provider;
      return memorySummary(conversation);
    }
    const now = new Date().toISOString();
    const conversation: MemoryConversation = {
      createdAt: now,
      createdBy: context.actor.userId,
      id: crypto.randomUUID(),
      lastMessageAt: now,
      messages: [],
      mode: input.mode,
      model: input.model,
      provider: input.provider,
      status: 'active',
      tenantId: context.actor.tenantId,
      title: safeTitle(input.title),
    };
    memoryState().conversations.set(conversation.id, conversation);
    return memorySummary(conversation);
  }

  const admin = createSupabaseAdminClient();
  if (input.conversationId !== undefined) {
    const result = await admin
      .from('ai_conversations')
      .update({
        mode: input.mode,
        selected_model: input.model,
        selected_provider: input.provider,
      })
      .eq('id', input.conversationId)
      .eq('tenant_id', context.actor.tenantId)
      .select('*')
      .maybeSingle();
    if (result.error !== null) {
      throw new AssistantPersistenceError(
        'ASSISTANT_PERSISTENCE_FAILED',
        'The AI conversation could not be updated.',
      );
    }
    if (result.data === null) {
      throw new AssistantPersistenceError(
        'ASSISTANT_CONVERSATION_NOT_FOUND',
        'The AI conversation was not found.',
      );
    }
    const row = ConversationRowSchema.safeParse(result.data);
    if (!row.success) {
      throw new AssistantPersistenceError(
        'ASSISTANT_PERSISTENCE_FAILED',
        'The AI conversation record is invalid.',
      );
    }
    return conversationSummary(row.data);
  }

  const result = await admin
    .from('ai_conversations')
    .insert({
      created_by: context.actor.userId,
      mode: input.mode,
      selected_model: input.model,
      selected_provider: input.provider,
      tenant_id: context.actor.tenantId,
      title: safeTitle(input.title),
    })
    .select('*')
    .single();
  const row = ConversationRowSchema.safeParse(result.data);
  if (result.error !== null || !row.success) {
    throw new AssistantPersistenceError(
      'ASSISTANT_PERSISTENCE_FAILED',
      'The AI conversation could not be created.',
    );
  }
  return conversationSummary(row.data);
}

export async function appendAssistantMessage(
  context: WorkspaceContext,
  input: {
    readonly body: string;
    readonly conversationId: string;
    readonly inputUnits?: number;
    readonly image?: AssistantImageSummary;
    readonly model?: string;
    readonly outputUnits?: number;
    readonly plan?: AIPlannerOutput;
    readonly provider?: AiProviderName;
    readonly role: 'assistant' | 'user';
    readonly status?: 'cancelled' | 'completed' | 'failed';
  },
): Promise<AssistantConversationMessage> {
  const status = input.status ?? 'completed';
  if (getEnvironment().mockMode) {
    const conversation = requireMemoryConversation(context, input.conversationId);
    const now = new Date().toISOString();
    const message = AssistantConversationMessageSchema.parse({
      body: input.body,
      createdAt: now,
      id: crypto.randomUUID(),
      ...(input.image === undefined ? {} : { image: input.image }),
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(input.plan === undefined ? {} : { plan: input.plan }),
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      role: input.role,
      status,
    });
    conversation.messages.push(message);
    conversation.lastMessageAt = now;
    return message;
  }

  const admin = createSupabaseAdminClient();
  const result = await admin
    .from('ai_messages')
    .insert({
      body: input.body,
      conversation_id: input.conversationId,
      ...(input.role === 'user' ? { created_by: context.actor.userId } : {}),
      input_units: input.inputUnits ?? 0,
      metadata: {
        ...(input.image === undefined ? {} : { image: input.image }),
        ...(input.plan === undefined ? {} : { plan: input.plan }),
      },
      ...(input.model === undefined ? {} : { model: input.model }),
      output_units: input.outputUnits ?? 0,
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      role: input.role,
      status,
      tenant_id: context.actor.tenantId,
    })
    .select('*')
    .single();
  const row = MessageRowSchema.safeParse(result.data);
  if (result.error !== null || !row.success) {
    throw new AssistantPersistenceError(
      'ASSISTANT_PERSISTENCE_FAILED',
      'The AI conversation message could not be saved.',
    );
  }
  return messageView(row.data);
}

export async function listAssistantConversations(
  context: WorkspaceContext,
): Promise<readonly AssistantConversationSummary[]> {
  if (getEnvironment().mockMode) {
    return [...memoryState().conversations.values()]
      .filter(
        (conversation) =>
          conversation.tenantId === context.actor.tenantId && conversation.status === 'active',
      )
      .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt))
      .slice(0, 100)
      .map(memorySummary);
  }

  const result = await createSupabaseAdminClient()
    .from('ai_conversations')
    .select('*')
    .eq('tenant_id', context.actor.tenantId)
    .eq('status', 'active')
    .order('last_message_at', { ascending: false })
    .limit(100);
  const rows = z.array(ConversationRowSchema).safeParse(result.data);
  if (result.error !== null || !rows.success) {
    throw new AssistantPersistenceError(
      'ASSISTANT_PERSISTENCE_FAILED',
      'AI conversations could not be listed.',
    );
  }
  return rows.data.map(conversationSummary);
}

export async function getAssistantConversation(
  context: WorkspaceContext,
  conversationId: string,
): Promise<AssistantConversation> {
  if (getEnvironment().mockMode) {
    const conversation = requireMemoryConversation(context, conversationId);
    return AssistantConversationSchema.parse({
      ...memorySummary(conversation),
      messages: conversation.messages,
    });
  }

  const admin = createSupabaseAdminClient();
  const [conversationResult, messageResult] = await Promise.all([
    admin
      .from('ai_conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('tenant_id', context.actor.tenantId)
      .maybeSingle(),
    admin
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', context.actor.tenantId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(200),
  ]);
  if (conversationResult.error !== null || messageResult.error !== null) {
    throw new AssistantPersistenceError(
      'ASSISTANT_PERSISTENCE_FAILED',
      'The AI conversation could not be loaded.',
    );
  }
  if (conversationResult.data === null) {
    throw new AssistantPersistenceError(
      'ASSISTANT_CONVERSATION_NOT_FOUND',
      'The AI conversation was not found.',
    );
  }
  const conversation = ConversationRowSchema.safeParse(conversationResult.data);
  const messages = z.array(MessageRowSchema).safeParse(messageResult.data);
  if (!conversation.success || !messages.success) {
    throw new AssistantPersistenceError(
      'ASSISTANT_PERSISTENCE_FAILED',
      'The AI conversation data is invalid.',
    );
  }
  return AssistantConversationSchema.parse({
    ...conversationSummary(conversation.data),
    messages: messages.data.map(messageView),
  });
}

export async function deleteAssistantConversation(
  context: WorkspaceContext,
  conversationId: string,
): Promise<void> {
  if (getEnvironment().mockMode) {
    requireMemoryConversation(context, conversationId);
    deleteMemoryAssistantImages(context.actor.tenantId, conversationId);
    memoryState().conversations.delete(conversationId);
    return;
  }

  const result = await createSupabaseAdminClient().rpc('delete_ai_conversation', {
    actor_id: context.actor.userId,
    target_conversation_id: conversationId,
    target_tenant_id: context.actor.tenantId,
  });
  const paths = z
    .array(z.object({ storage_path: z.string().min(10).max(300) }))
    .safeParse(result.data);
  if (result.error !== null) {
    if (result.error.message.includes('ASSISTANT_CONVERSATION_NOT_FOUND')) {
      throw new AssistantPersistenceError(
        'ASSISTANT_CONVERSATION_NOT_FOUND',
        'The AI conversation was not found.',
      );
    }
    throw new AssistantPersistenceError(
      'ASSISTANT_PERSISTENCE_FAILED',
      'The AI conversation could not be deleted.',
    );
  }
  if (!paths.success) {
    throw new AssistantPersistenceError(
      'ASSISTANT_PERSISTENCE_FAILED',
      'The AI conversation deletion result is invalid.',
    );
  }
  if (paths.data.length > 0) {
    await createSupabaseAdminClient()
      .storage.from('assistant-images')
      .remove(paths.data.map((row) => row.storage_path));
  }
}

export function createAssistantUsageSink(
  context: WorkspaceContext,
  conversationId: string,
  reservation: AssistantUsageReservation,
): UsageSink {
  let settled = false;
  const records: UsageRecord[] = [];

  async function settle(record: UsageRecord): Promise<void> {
    if (settled) return;
    records.push(structuredClone(record));
    if (!shouldSettleAssistantUsage(record, reservation.maxAttempts)) return;
    await recordReservedAssistantUsage(
      context,
      reservation,
      conversationId,
      aggregateAssistantUsageRecords(records),
    );
    settled = true;
  }

  if (getEnvironment().mockMode) {
    return {
      async record(record) {
        const usage = memoryState().usage;
        usage.push(structuredClone(record));
        if (usage.length > 1_000) {
          usage.splice(0, usage.length - 1_000);
        }
        await settle(record);
      },
    };
  }
  return {
    async record(record) {
      try {
        await settle(record);
      } catch (error) {
        throw new AssistantPersistenceError(
          'ASSISTANT_PERSISTENCE_FAILED',
          'AI usage could not be recorded.',
          { cause: error },
        );
      }
    },
  };
}
