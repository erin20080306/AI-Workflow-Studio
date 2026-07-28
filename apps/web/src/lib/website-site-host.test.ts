import { describe, expect, it } from 'vitest';

import {
  isPublishedWebsiteAssetPath,
  websiteSiteRewritePath,
  websiteSiteSlugFromHost,
  websiteSiteUrl,
} from './website-site-host';

describe('website wildcard host routing', () => {
  const slug = 'city-florist-a45676dc';

  it('accepts exactly one validated publication label under the platform suffix', () => {
    expect(websiteSiteSlugFromHost(`${slug}.sites.erin-aiworkflowstudio.com`)).toBe(slug);
    expect(websiteSiteSlugFromHost(`${slug}.sites.erin-aiworkflowstudio.com:443`)).toBe(slug);
    expect(
      websiteSiteSlugFromHost(`${slug}.sites.erin-aiworkflowstudio.com, internal-proxy.example`),
    ).toBe(slug);
  });

  it('rejects the apex, nested labels, unrelated hosts, and invalid labels', () => {
    expect(websiteSiteSlugFromHost('sites.erin-aiworkflowstudio.com')).toBeUndefined();
    expect(
      websiteSiteSlugFromHost(`nested.${slug}.sites.erin-aiworkflowstudio.com`),
    ).toBeUndefined();
    expect(websiteSiteSlugFromHost(`${slug}.example.com`)).toBeUndefined();
    expect(websiteSiteSlugFromHost(`bad_slug.sites.erin-aiworkflowstudio.com`)).toBeUndefined();
  });

  it('maps root and inner-page paths to the existing safe public renderer', () => {
    expect(websiteSiteRewritePath(slug, '/')).toBe(`/s/${slug}`);
    expect(websiteSiteRewritePath(slug, '/services')).toBe(`/s/${slug}/services`);
    expect(websiteSiteRewritePath(slug, `/s/${slug}/services`)).toBe(`/s/${slug}/services`);
  });

  it('keeps only the matching publication asset endpoint outside page rewrites', () => {
    expect(isPublishedWebsiteAssetPath(`/api/public-sites/${slug}/assets/hero-art`, slug)).toBe(
      true,
    );
    expect(
      isPublishedWebsiteAssetPath('/api/public-sites/another-site/assets/hero-art', slug),
    ).toBe(false);
  });

  it('builds the stable HTTPS platform subdomain', () => {
    expect(websiteSiteUrl(slug)).toBe(`https://${slug}.sites.erin-aiworkflowstudio.com`);
    expect(() => websiteSiteUrl('bad_slug')).toThrow();
  });
});
