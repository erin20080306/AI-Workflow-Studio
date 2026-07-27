import { WebsiteSpecSchema } from '@ai-workflow-studio/website-schema';
import { describe, expect, it } from 'vitest';

import {
  WEBSITE_PREVIEW_HEADERS,
  WEBSITE_PREVIEW_VIEWPORTS,
  websitePreviewUrl,
} from './website-preview-contract';
import { renderWebsitePreviewDocument } from './website-preview-renderer';

const spec = WebsiteSpecSchema.parse({
  assets: [],
  locale: 'en',
  name: 'A & B Studio',
  navigation: {
    brandLabel: 'A & B Studio',
    items: [{ label: 'Home', pageSlug: 'home' }],
  },
  pages: [
    {
      metaDescription: 'A safe deterministic website preview for testing.',
      sections: [
        {
          body: 'A deterministic preview from a validated specification.',
          id: 'hero-main',
          layout: 'split',
          primaryAction: {
            label: 'Get started',
            target: { channel: 'form', kind: 'contact' },
          },
          title: 'Safe website preview',
          type: 'hero',
        },
        {
          copyright: 'A & B Studio · All rights reserved',
          id: 'footer-main',
          links: [{ label: 'Home', target: { kind: 'page', pageSlug: 'home' } }],
          type: 'footer',
        },
      ],
      slug: 'home',
      title: 'Home',
    },
  ],
  schemaVersion: 1,
  theme: {
    appearance: 'light',
    density: 'balanced',
    palette: 'navy-cyan',
    radius: 'rounded',
    typography: 'modern-sans',
  },
});

describe('website preview', () => {
  it('defines bounded responsive viewport sizes', () => {
    expect(WEBSITE_PREVIEW_VIEWPORTS).toEqual({
      desktop: expect.objectContaining({ height: 900, width: 1440 }),
      mobile: expect.objectContaining({ height: 844, width: 390 }),
      tablet: expect.objectContaining({ height: 1024, width: 768 }),
    });
  });

  it('builds a versioned internal preview route', () => {
    expect(websitePreviewUrl('10000000-0000-4000-8000-000000000701', 'product-home', 2, 3)).toBe(
      '/api/websites/10000000-0000-4000-8000-000000000701/preview/product-home?version=2&refresh=3',
    );
  });

  it('escapes validated text in static markup without scripts or forms', () => {
    const html = renderWebsitePreviewDocument(spec, 'home');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('A &amp; B Studio');
    expect(html).toContain('Safe website preview');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<form');
  });

  it('renders deterministically and keeps asset references inside registered markup', () => {
    const assetSpec = WebsiteSpecSchema.parse({
      ...spec,
      assets: [
        {
          alt: 'Secure automation illustration',
          id: 'hero-art',
          kind: 'placeholder',
          role: 'hero',
        },
      ],
      pages: [
        {
          ...spec.pages[0],
          sections: spec.pages[0]?.sections.map((section) =>
            section.type === 'hero' ? { ...section, assetId: 'hero-art' } : section,
          ),
        },
      ],
    });
    const first = renderWebsitePreviewDocument(assetSpec, 'home');
    expect(renderWebsitePreviewDocument(assetSpec, 'home')).toBe(first);
    expect(first).toContain('Secure automation illustration');
    expect(first).not.toContain('hero-art');
  });

  it('renders only server-approved private generated asset URLs', () => {
    const generatedSpec = WebsiteSpecSchema.parse({
      ...spec,
      assets: [
        {
          alt: 'Generated private hero',
          id: 'asset-private-hero',
          kind: 'project-asset',
          role: 'hero',
        },
      ],
      pages: [
        {
          ...spec.pages[0],
          sections: spec.pages[0]?.sections.map((section) =>
            section.type === 'hero'
              ? { ...section, assetId: 'asset-private-hero', layout: 'split' }
              : section,
          ),
        },
      ],
    });
    const approvedUrl =
      'https://example-project.supabase.co/storage/v1/object/sign/website-assets/private.png?token=short';
    const html = renderWebsitePreviewDocument(
      generatedSpec,
      'home',
      new Map([['asset-private-hero', approvedUrl]]),
    );
    expect(html).toContain(`<img alt="Generated private hero"`);
    expect(html).toContain(approvedUrl.replaceAll('&', '&amp;'));

    const blocked = renderWebsitePreviewDocument(
      generatedSpec,
      'home',
      new Map([['asset-private-hero', 'https://attacker.example/private.png']]),
    );
    expect(blocked).not.toContain('attacker.example');
    expect(blocked).not.toContain('<img alt="Generated private hero"');
  });

  it('locks the preview response to a no-script, no-network CSP', () => {
    expect(WEBSITE_PREVIEW_HEADERS['content-security-policy']).toContain("script-src 'none'");
    expect(WEBSITE_PREVIEW_HEADERS['content-security-policy']).toContain("connect-src 'none'");
    expect(WEBSITE_PREVIEW_HEADERS['content-security-policy']).toContain("form-action 'none'");
    expect(WEBSITE_PREVIEW_HEADERS['content-security-policy']).toContain(
      'img-src data: https://*.supabase.co',
    );
  });

  it('rejects a page outside the validated specification', () => {
    expect(() => renderWebsitePreviewDocument(spec, 'missing')).toThrow(
      'Website preview page not found.',
    );
  });
});
