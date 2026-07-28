import { describe, expect, it } from 'vitest';

import {
  defaultWebsiteSiteSlug,
  isPublishedWebsiteAssetPath,
  normalizeWebsiteSiteSlug,
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
    expect(websiteSiteUrl('bad_slug')).toBe('https://bad-slug.sites.erin-aiworkflowstudio.com');
  });

  it('normalizes a customer-selected label while rejecting system names', () => {
    expect(normalizeWebsiteSiteSlug('  Erin Studio 2026 ')).toBe('erin-studio-2026');
    expect(normalizeWebsiteSiteSlug('ERIN__SHOP')).toBe('erin-shop');
    expect(() => normalizeWebsiteSiteSlug('www')).toThrow();
    expect(() => normalizeWebsiteSiteSlug('中文網站')).toThrow();
  });

  it('creates a DNS-safe default label with a stable project suffix', () => {
    const generated = defaultWebsiteSiteSlug(
      'this-project-name-is-intentionally-longer-than-a-single-friendly-prefix',
      'a45676dc-89ac-69a7-39d3-45c2a6d7aa64',
    );
    expect(generated).toBe('this-project-name-is-intentionally-long-a45676dc');
    expect(generated.length).toBeLessThanOrEqual(63);
  });
});
