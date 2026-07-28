import { describe, expect, it } from 'vitest';

import { websiteDeploymentGuide } from './website-deployment-guide';
import type { WebsiteGithubPublication } from './website-github-schema';

const publication: WebsiteGithubPublication = {
  branch: 'ai-workflow-studio/demo-site',
  commitSha: 'a'.repeat(40),
  commitUrl: 'https://github.com/example/demo/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  repositoryFullName: 'example/demo',
  sourceSha256: 'b'.repeat(64),
  version: 3,
};

describe('website deployment guide', () => {
  it('produces allowlisted official deployment destinations with the exact managed branch', () => {
    const guides = [
      websiteDeploymentGuide('vercel', publication, 'zh-Hant'),
      websiteDeploymentGuide('cloudflare-pages', publication, 'zh-Hant'),
      websiteDeploymentGuide('github-pages', publication, 'zh-Hant'),
    ];

    expect(guides.map((guide) => new URL(guide.actionUrl).hostname)).toEqual([
      'vercel.com',
      'dash.cloudflare.com',
      'github.com',
    ]);
    for (const guide of guides) {
      expect(guide.steps.join(' ')).toContain(publication.branch);
      expect(guide.steps.length).toBeGreaterThanOrEqual(4);
    }
  });
});
