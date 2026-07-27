import type { AiModelTier } from '@ai-workflow-studio/shared/plans';

export type WebsiteImageProvider = 'gemini' | 'openai';

export const WEBSITE_IMAGE_MODELS_BY_TIER = {
  gemini: {
    advanced: 'gemini-3.1-flash-image',
    economy: 'gemini-3.1-flash-lite-image',
    flagship: 'gemini-3-pro-image',
    standard: 'gemini-3.1-flash-image',
  },
  openai: {
    advanced: 'gpt-image-2',
    economy: 'gpt-image-2',
    flagship: 'gpt-image-2',
    standard: 'gpt-image-2',
  },
} as const satisfies Readonly<Record<WebsiteImageProvider, Readonly<Record<AiModelTier, string>>>>;

export function websiteImageModelLabel(tier: AiModelTier): string {
  return `OpenAI ${WEBSITE_IMAGE_MODELS_BY_TIER.openai[tier]} / Gemini ${WEBSITE_IMAGE_MODELS_BY_TIER.gemini[tier]}`;
}
