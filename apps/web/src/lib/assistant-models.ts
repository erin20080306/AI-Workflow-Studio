import type { AiProviderName } from '@ai-workflow-studio/ai-gateway';

import type { AppEnvironment } from './env-schema';

export type AssistantModelId = 'auto' | AiProviderName;

export interface AssistantModelOption {
  readonly configured: boolean;
  readonly description: {
    readonly en: string;
    readonly zhHant: string;
  };
  readonly id: AssistantModelId;
  readonly label: string;
  readonly provider?: AiProviderName;
}

const providerPriority: readonly AiProviderName[] = ['openai', 'anthropic', 'gemini', 'mock'];

export function buildAssistantModelOptions(
  environment: AppEnvironment,
): readonly AssistantModelOption[] {
  const providerOptions: readonly AssistantModelOption[] = [
    {
      configured: environment.providers.openai,
      description: {
        en: 'Strong planning and structured workflow generation.',
        zhHant: '適合複雜規劃與結構化工作流產生。',
      },
      id: 'openai',
      label: 'OpenAI',
      provider: 'openai',
    },
    {
      configured: environment.providers.anthropic,
      description: {
        en: 'Claude for careful analysis and long-form planning.',
        zhHant: 'Claude 適合審慎分析與長篇規劃。',
      },
      id: 'anthropic',
      label: 'Claude',
      provider: 'anthropic',
    },
    {
      configured: environment.providers.gemini,
      description: {
        en: 'Gemini for fast multimodal-ready planning.',
        zhHant: 'Gemini 適合快速且可延伸至多模態的規劃。',
      },
      id: 'gemini',
      label: 'Gemini',
      provider: 'gemini',
    },
    ...(environment.mockMode
      ? [
          {
            configured: true,
            description: {
              en: 'Deterministic development planner; no external request.',
              zhHant: '可重現的開發規劃器，不會送出外部請求。',
            },
            id: 'mock',
            label: 'Mock Studio',
            provider: 'mock',
          } satisfies AssistantModelOption,
        ]
      : []),
  ];
  const autoConfigured = providerOptions.some((option) => option.configured);

  return [
    {
      configured: autoConfigured,
      description: {
        en: 'Select the first configured provider using the safe routing policy.',
        zhHant: '依安全路由規則選擇第一個已設定的 Provider。',
      },
      id: 'auto',
      label: 'Auto',
    },
    ...providerOptions,
  ];
}

export function resolveAssistantProvider(
  selectedModel: AssistantModelId,
  options: readonly AssistantModelOption[],
): AiProviderName | undefined {
  if (selectedModel !== 'auto') {
    return options.find((option) => option.id === selectedModel && option.configured)?.provider;
  }

  for (const provider of providerPriority) {
    const option = options.find((candidate) => candidate.provider === provider);
    if (option?.configured === true) {
      return provider;
    }
  }

  return undefined;
}
