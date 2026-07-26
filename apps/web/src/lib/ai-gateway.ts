import 'server-only';

import {
  AiGateway,
  AiGatewayError,
  AnthropicAdapter,
  GeminiAdapter,
  MockAiAdapter,
  OpenAiAdapter,
  RedactedConsoleUsageSink,
  type AiProviderAdapter,
  type AiProviderName,
} from '@ai-workflow-studio/ai-gateway';

import { getEnvironment } from './env';

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

function createAdapter(provider: AiProviderName): AiProviderAdapter {
  const environment = getEnvironment();
  switch (provider) {
    case 'anthropic':
      return new AnthropicAdapter({
        apiKey: requiredKey(provider),
        model: environment.providerModels.anthropic,
      });
    case 'gemini':
      return new GeminiAdapter({
        apiKey: requiredKey(provider),
        model: environment.providerModels.gemini,
      });
    case 'mock':
      return new MockAiAdapter();
    case 'openai':
      return new OpenAiAdapter({
        apiKey: requiredKey(provider),
        model: environment.providerModels.openai,
      });
  }
}

export function createServerAiGateway(provider: AiProviderName): AiGateway {
  return new AiGateway(createAdapter(provider), new RedactedConsoleUsageSink());
}
