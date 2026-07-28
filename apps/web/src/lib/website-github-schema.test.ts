import { describe, expect, it } from 'vitest';

import {
  WebsiteGithubPushInputSchema,
  WebsiteGithubRepositoryUrlSchema,
  githubBranchForSiteSlug,
} from './website-github-schema';

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

  it('normalizes a pasted HTTPS repository URL and rejects tokens or non-GitHub hosts', () => {
    expect(
      WebsiteGithubRepositoryUrlSchema.parse('https://github.com/Example/website.git/'),
    ).toEqual({
      fullName: 'Example/website',
      normalizedUrl: 'https://github.com/Example/website',
    });
    expect(
      WebsiteGithubRepositoryUrlSchema.safeParse('https://token@github.com/example/website')
        .success,
    ).toBe(false);
    expect(
      WebsiteGithubRepositoryUrlSchema.safeParse('https://gitlab.com/example/website').success,
    ).toBe(false);
    expect(
      WebsiteGithubRepositoryUrlSchema.safeParse(
        'https://github.com/example/website?access_token=secret',
      ).success,
    ).toBe(false);
  });
});
