import type { AiProviderName } from '@ai-workflow-studio/ai-gateway';

export type PlannerAccessDecision =
  | {
      readonly allowed: true;
    }
  | {
      readonly allowed: false;
      readonly code: 'AI_AUTH_REQUIRED' | 'AI_EXTERNAL_PROVIDER_REQUIRES_AUTH';
      readonly message: string;
      readonly status: 403 | 503;
    };

export function plannerAccessDecision(
  mockMode: boolean,
  provider: AiProviderName,
): PlannerAccessDecision {
  if (!mockMode) {
    return {
      allowed: false,
      code: 'AI_AUTH_REQUIRED',
      message: 'Authenticated planning is not configured for this server.',
      status: 503,
    };
  }

  if (provider !== 'mock') {
    return {
      allowed: false,
      code: 'AI_EXTERNAL_PROVIDER_REQUIRES_AUTH',
      message: 'External AI providers require an authenticated workspace.',
      status: 403,
    };
  }

  return { allowed: true };
}
