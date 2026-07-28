import { AiGatewayError } from '@ai-workflow-studio/ai-gateway';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/usage-control-server', () => ({
  UsageControlError: class UsageControlError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'UsageControlError';
    }
  },
}));
vi.mock('@/lib/website-studio-server', () => ({
  WebsiteStudioError: class WebsiteStudioError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'WebsiteStudioError';
    }
  },
}));

describe('Website Studio API errors', () => {
  let websiteApiError: typeof import('./website-studio-api').websiteApiError;
  let UsageControlError: typeof import('./usage-control-server').UsageControlError;

  beforeAll(async () => {
    ({ websiteApiError } = await import('./website-studio-api'));
    ({ UsageControlError } = await import('@/lib/usage-control-server'));
  });

  it('preserves safe AI provider classifications instead of returning an opaque conflict', async () => {
    const response = websiteApiError(
      new AiGatewayError('AI_PROVIDER_QUOTA_EXCEEDED', 'The provider quota has been reached.'),
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'AI_PROVIDER_QUOTA_EXCEEDED',
        message: 'The provider quota has been reached.',
      },
    });
  });

  it('does not let a Website Studio fallback bypass Tenant budget limits', async () => {
    const response = websiteApiError(
      new UsageControlError('USAGE_BUDGET_EXCEEDED', 'The monthly AI budget has been reached.'),
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'USAGE_BUDGET_EXCEEDED',
        message: 'The monthly AI budget has been reached.',
      },
    });
  });
});
