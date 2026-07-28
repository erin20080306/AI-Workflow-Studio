import type { AiProviderName } from '@ai-workflow-studio/ai-gateway';

import type { AiModelTier, AiModelTierSelection, AiTierOption } from './ai-model-selection';
import type { AppEnvironment } from './env-schema';

export type AssistantModelId = 'auto' | AiProviderName;
export type AssistantExactModelOptionId =
  'auto' | 'mock:auto' | `${Exclude<AiProviderName, 'mock'>}:${AiModelTier}`;

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

export interface AssistantExactModelOption {
  readonly enabled: boolean;
  readonly id: AssistantExactModelOptionId;
  readonly model?: string;
  readonly provider: AssistantModelId;
  readonly providerLabel: string;
  readonly tier: AiModelTierSelection;
  readonly tierLabel?: {
    readonly en: string;
    readonly zhHant: string;
  };
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

export function buildAssistantExactModelOptions(
  models: readonly AssistantModelOption[],
  tiers: readonly AiTierOption[],
): readonly AssistantExactModelOption[] {
  const configured = new Map(
    models
      .filter(
        (model): model is AssistantModelOption & { readonly provider: AiProviderName } =>
          model.provider !== undefined,
      )
      .map((model) => [model.provider, model.configured] as const),
  );
  const auto = models.find((model) => model.id === 'auto');
  const exact = tiers.flatMap((tier) =>
    tier.models.map((model): AssistantExactModelOption => ({
      enabled: tier.enabled && configured.get(model.provider) === true,
      id: `${model.provider}:${tier.id}`,
      model: model.model,
      provider: model.provider,
      providerLabel: model.providerLabel,
      tier: tier.id,
      tierLabel: tier.label,
    })),
  );
  const mock = models.find((model) => model.id === 'mock');

  return [
    {
      enabled: auto?.configured === true,
      id: 'auto',
      provider: 'auto',
      providerLabel: 'Auto',
      tier: 'auto',
    },
    ...exact,
    ...(mock === undefined
      ? []
      : [
          {
            enabled: mock.configured,
            id: 'mock:auto',
            provider: 'mock',
            providerLabel: mock.label,
            tier: 'auto',
          } satisfies AssistantExactModelOption,
        ]),
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
