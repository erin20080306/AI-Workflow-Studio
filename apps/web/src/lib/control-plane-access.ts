import type { AiProviderName } from '@ai-workflow-studio/ai-gateway';

export type PlannerAccessDecision =
  | {
      readonly allowed: true;
    }
  | {
      readonly allowed: false;
      readonly code: 'AI_AUTH_REQUIRED' | 'AI_EXTERNAL_PROVIDER_REQUIRES_AUTH';
      readonly message: string;
      readonly status: 401 | 403;
    };

export function plannerAccessDecision(
  mockMode: boolean,
  provider: AiProviderName,
  workspaceAuthenticated: boolean,
): PlannerAccessDecision {
  if (!mockMode && !workspaceAuthenticated) {
    return {
      allowed: false,
      code: 'AI_AUTH_REQUIRED',
      message: 'An authenticated workspace is required.',
      status: 401,
    };
  }

  if (mockMode && provider !== 'mock') {
    return {
      allowed: false,
      code: 'AI_EXTERNAL_PROVIDER_REQUIRES_AUTH',
      message: 'External AI providers require an authenticated workspace.',
      status: 403,
    };
  }

  return { allowed: true };
}
