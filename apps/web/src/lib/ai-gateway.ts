import 'server-only';

import {
  AiChatGateway,
  AiGateway,
  AiGatewayError,
  AnthropicAdapter,
  GeminiAdapter,
  MockAiAdapter,
  OpenAiAdapter,
  RedactedConsoleUsageSink,
  StructuredOutputGateway,
  type AiChatAdapter,
  type AiProviderAdapter,
  type AiProviderName,
  type UsageSink,
} from '@ai-workflow-studio/ai-gateway';

import { getEnvironment } from './env';
import type { OpenAiReasoningEffort } from './ai-model-catalog';

function requiredKey(provider: Exclude<AiProviderName, 'mock'>): string {
  const names = {
    anthropic: 'ANTHROPIC_API_KEY',
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
  } as const;
  const value = process.env[names[provider]];
  if (value === undefined || value.length < 24) {
    throw new AiGatewayError(
      'AI_PROVIDER_NOT_CONFIGURED',
      `${provider} is not configured for this server.`,
    );
  }
  return value;
}

interface ServerModelOverride {
  readonly model: string;
  readonly reasoningEffort?: OpenAiReasoningEffort;
}

function createAdapter(
  provider: AiProviderName,
  override?: ServerModelOverride,
): AiProviderAdapter & AiChatAdapter {
  const environment = getEnvironment();
  switch (provider) {
    case 'anthropic':
      return new AnthropicAdapter({
        apiKey: requiredKey(provider),
        model: override?.model ?? environment.providerModels.anthropic,
      });
    case 'gemini':
      return new GeminiAdapter({
        apiKey: requiredKey(provider),
        model: override?.model ?? environment.providerModels.gemini,
      });
    case 'mock':
      return new MockAiAdapter();
    case 'openai':
      return new OpenAiAdapter({
        apiKey: requiredKey(provider),
        model: override?.model ?? environment.providerModels.openai,
        ...(override?.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: override.reasoningEffort }),
      });
  }
}

export function createServerStructuredOutputGateway(
  provider: AiProviderName,
  usageSink: UsageSink,
  override?: ServerModelOverride,
): StructuredOutputGateway {
  return new StructuredOutputGateway(createAdapter(provider, override), usageSink);
}

export function createServerAiGateway(
  provider: AiProviderName,
  usageSink: UsageSink = new RedactedConsoleUsageSink(),
  override?: ServerModelOverride,
): AiGateway {
  return new AiGateway(createAdapter(provider, override), usageSink);
}

export function createServerAiChatGateway(
  provider: AiProviderName,
  usageSink: UsageSink,
  override?: ServerModelOverride,
): AiChatGateway {
  return new AiChatGateway(createAdapter(provider, override), usageSink);
}
