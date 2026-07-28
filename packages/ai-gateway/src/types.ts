import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  PreparedSourceSchema,
} from '@ai-workflow-studio/tool-registry';
import { ExecutionTargetSchema, type AIPlannerOutput } from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

export const AiProviderNameSchema = z.enum(['anthropic', 'gemini', 'mock', 'openai']);
export type AiProviderName = z.infer<typeof AiProviderNameSchema>;

export const ChatMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(12_000),
    role: z.enum(['assistant', 'user']),
  })
  .strict();

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z
  .object({
    locale: z.enum(['en', 'zh-Hant']).default('zh-Hant'),
    maxOutputTokens: z.number().int().min(64).max(4_096).default(2_048),
    messages: z.array(ChatMessageSchema).min(1).max(40),
    sources: z.array(PreparedSourceSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
  })
  .strict();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const PlannerRequestSchema = z
  .object({
    context: z
      .object({
        allowedFolderAliasIds: z.array(z.string().uuid()).max(20).default([]),
        executionTarget: ExecutionTargetSchema,
        locale: z.string().trim().min(2).max(20).default('zh-Hant'),
        timezone: z.string().trim().min(1).max(100).default('Asia/Taipei'),
      })
      .strict(),
    maxRepairAttempts: z.number().int().min(0).max(2).default(1),
    prompt: z.string().trim().min(2).max(8_000),
  })
  .strict();

export type PlannerRequest = z.infer<typeof PlannerRequestSchema>;

export interface ProviderCompletionRequest {
  readonly attempt: number;
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly maxOutputTokens: number;
  readonly mockOutput?: unknown;
  readonly operation: 'website_generation' | 'workflow_plan';
  readonly plannerRequest?: PlannerRequest;
  readonly schemaName: string;
  readonly signal?: AbortSignal;
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

export interface ProviderTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface ProviderCompletion {
  readonly model: string;
  readonly requestId?: string;
  readonly text: string;
  readonly usage: ProviderTokenUsage;
}

export interface AiProviderAdapter {
  readonly model: string;
  readonly provider: AiProviderName;
  complete(request: ProviderCompletionRequest): Promise<ProviderCompletion>;
}

export interface ProviderChatRequest {
  readonly chatRequest: ChatRequest;
  readonly messages: readonly ChatMessage[];
  readonly signal?: AbortSignal;
  readonly systemPrompt: string;
}

export type ProviderChatEvent =
  | {
      readonly text: string;
      readonly type: 'delta';
    }
  | {
      readonly model: string;
      readonly requestId?: string;
      readonly type: 'done';
      readonly usage: ProviderTokenUsage;
    };

export interface AiChatAdapter {
  readonly model: string;
  readonly provider: AiProviderName;
  streamChat(request: ProviderChatRequest): AsyncIterable<ProviderChatEvent>;
}

export type ChatGatewayEvent =
  | {
      readonly text: string;
      readonly type: 'delta';
    }
  | {
      readonly model: string;
      readonly provider: AiProviderName;
      readonly requestId?: string;
      readonly type: 'done';
      readonly usage: ProviderTokenUsage;
    };

export interface PlannerResult {
  readonly attempts: number;
  readonly model: string;
  readonly output: AIPlannerOutput;
  readonly provider: AiProviderName;
  readonly usage: ProviderTokenUsage;
}

export interface UsageRecord {
  readonly attempt: number;
  readonly durationMs: number;
  readonly inputTokens: number;
  readonly model: string;
  readonly operation: 'chat' | 'website_generation' | 'workflow_plan';
  readonly outcome: 'cancelled' | 'failed' | 'invalid' | 'succeeded';
  readonly outputTokens: number;
  readonly provider: AiProviderName;
  readonly validationCodes: readonly string[];
}

export interface UsageSink {
  record(record: UsageRecord): Promise<void>;
}

export type FetchTransport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
