import { describe, expect, it } from 'vitest';

import { WebsiteGithubPushInputSchema, githubBranchForSiteSlug } from './website-github-schema';

describe('website GitHub publishing input', () => {
  it('uses an isolated managed branch namespace', () => {
    expect(githubBranchForSiteSlug('Erin AI 商店')).toBe('ai-workflow-studio/erin-ai');
    expect(
      WebsiteGithubPushInputSchema.parse({
        branch: 'ai-workflow-studio/erin-ai',
        confirmed: true,
        idempotencyKey: '10000000-0000-4000-8000-000000000701',
        repositoryId: '123456',
        version: 4,
      }),
    ).toMatchObject({ version: 4 });
  });

  it('rejects arbitrary branches and missing confirmation', () => {
    expect(
      WebsiteGithubPushInputSchema.safeParse({
        branch: 'main',
        confirmed: true,
        idempotencyKey: '10000000-0000-4000-8000-000000000701',
        repositoryId: '123456',
        version: 4,
      }).success,
    ).toBe(false);
    expect(
      WebsiteGithubPushInputSchema.safeParse({
        branch: 'ai-workflow-studio/erin-ai',
        confirmed: false,
        idempotencyKey: '10000000-0000-4000-8000-000000000701',
        repositoryId: '123456',
        version: 4,
      }).success,
    ).toBe(false);
  });
});
