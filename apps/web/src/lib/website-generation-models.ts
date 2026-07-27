import type { AiProviderName } from '@ai-workflow-studio/ai-gateway';
import type {
  WebsiteGenerationSelection,
  WebsiteGenerationProvider,
} from '@ai-workflow-studio/website-schema';

import type { AppEnvironment } from './env-schema';

export interface WebsiteGenerationModelOption {
  readonly description: {
    readonly en: string;
    readonly zhHant: string;
  };
  readonly id: WebsiteGenerationSelection;
  readonly label: string;
  readonly level: {
    readonly en: string;
    readonly zhHant: string;
  };
}

const providerPriority: readonly WebsiteGenerationProvider[] = [
  'openai',
  'anthropic',
  'gemini',
  'mock',
];

export function buildWebsiteGenerationModelOptions(
  environment: AppEnvironment,
): readonly WebsiteGenerationModelOption[] {
  const options: readonly (WebsiteGenerationModelOption & {
    readonly provider: WebsiteGenerationProvider;
  })[] = [
    ...(environment.providers.openai
      ? [
          {
            description: {
              en: 'Detailed structure and polished product copy.',
              zhHant: '適合細緻結構與完整產品文案。',
            },
            id: 'openai',
            label: 'OpenAI',
            level: { en: 'Advanced', zhHant: '進階' },
            provider: 'openai',
          } satisfies WebsiteGenerationModelOption & {
            readonly provider: WebsiteGenerationProvider;
          },
        ]
      : []),
    ...(environment.providers.anthropic
      ? [
          {
            description: {
              en: 'Careful information architecture and content hierarchy.',
              zhHant: '適合審慎的資訊架構與內容層級。',
            },
            id: 'anthropic',
            label: 'Claude',
            level: { en: 'Advanced', zhHant: '進階' },
            provider: 'anthropic',
          } satisfies WebsiteGenerationModelOption & {
            readonly provider: WebsiteGenerationProvider;
          },
        ]
      : []),
    ...(environment.providers.gemini
      ? [
          {
            description: {
              en: 'Fast structured generation for guided drafts.',
              zhHant: '適合快速產生結構化引導草稿。',
            },
            id: 'gemini',
            label: 'Gemini',
            level: { en: 'Efficient', zhHant: '高效率' },
            provider: 'gemini',
          } satisfies WebsiteGenerationModelOption & {
            readonly provider: WebsiteGenerationProvider;
          },
        ]
      : []),
    ...(environment.mockMode
      ? [
          {
            description: {
              en: 'Deterministic local specification without an external request.',
              zhHant: '不送出外部請求的可重現本機規格。',
            },
            id: 'mock',
            label: 'Mock Studio',
            level: { en: 'Development', zhHant: '開發測試' },
            provider: 'mock',
          } satisfies WebsiteGenerationModelOption & {
            readonly provider: WebsiteGenerationProvider;
          },
        ]
      : []),
  ];

  if (options.length === 0) return [];
  return [
    {
      description: {
        en: 'Safely routes to the first available provider.',
        zhHant: '依安全路由規則自動選擇可用模型。',
      },
      id: 'auto',
      label: 'Auto',
      level: { en: 'Recommended', zhHant: '建議' },
    },
    ...options.map((option) => ({
      description: option.description,
      id: option.id,
      label: option.label,
      level: option.level,
    })),
  ];
}

export function resolveWebsiteGenerationProvider(
  selection: WebsiteGenerationSelection,
  environment: AppEnvironment,
): AiProviderName | undefined {
  if (selection === 'mock') return environment.mockMode ? 'mock' : undefined;
  if (selection !== 'auto') {
    return environment.providers[selection] ? selection : undefined;
  }
  for (const provider of providerPriority) {
    if (provider === 'mock' ? environment.mockMode : environment.providers[provider]) {
      return provider;
    }
  }
  return undefined;
}
