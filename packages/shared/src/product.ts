export const PRODUCT = {
  displayName: 'AI Workflow Studio',
  slug: 'ai-workflow-studio',
  desktopAppId: 'com.aiworkflowstudio.desktop',
  supportEmail: 'support@example.invalid',
} as const;

export type ProductConfig = typeof PRODUCT;
