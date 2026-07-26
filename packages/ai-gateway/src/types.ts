import { ExecutionTargetSchema, type AIPlannerOutput } from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

export const AiProviderNameSchema = z.enum(['anthropic', 'gemini', 'mock', 'openai']);
export type AiProviderName = z.infer<typeof AiProviderNameSchema>;

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
    prompt: z.string().trim().min(12).max(8_000),
  })
  .strict();

export type PlannerRequest = z.infer<typeof PlannerRequestSchema>;

export interface ProviderCompletionRequest {
  readonly attempt: number;
  readonly plannerRequest: PlannerRequest;
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
  readonly operation: 'workflow_plan';
  readonly outcome: 'failed' | 'invalid' | 'succeeded';
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
