import { AiGatewayError } from '@ai-workflow-studio/ai-gateway';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/github-app-client', () => ({
  GithubAppError: class GithubAppError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.name = 'GithubAppError';
      this.status = status;
    }
  },
}));
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
  let GithubAppError: typeof import('./github-app-client').GithubAppError;
  let UsageControlError: typeof import('./usage-control-server').UsageControlError;

  beforeAll(async () => {
    ({ websiteApiError } = await import('./website-studio-api'));
    ({ GithubAppError } = await import('@/lib/github-app-client'));
    ({ UsageControlError } = await import('@/lib/usage-control-server'));
  });

  it('preserves safe GitHub App failures without exposing credentials', async () => {
    const response = websiteApiError(
      new GithubAppError(
        'GITHUB_HTTP_403',
        'GitHub could not complete the requested operation.',
        403,
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'GITHUB_HTTP_403',
        message: 'GitHub could not complete the requested operation.',
      },
    });
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
