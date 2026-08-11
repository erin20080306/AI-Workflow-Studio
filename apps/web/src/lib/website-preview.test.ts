import { WebsiteSpecSchema } from '@ai-workflow-studio/website-schema';
import { describe, expect, it } from 'vitest';

import { WEBSITE_CART_SCRIPT_SHA256 } from './website-cart';
import {
  WEBSITE_PUBLIC_HEADERS,
  WEBSITE_PREVIEW_HEADERS,
  WEBSITE_PREVIEW_VIEWPORTS,
  websitePreviewUrl,
} from './website-preview-contract';
import {
  applyInventorySold,
  renderWebsitePreviewDocument,
  renderWebsitePublishedDocument,
  renderWebsiteStaticDocument,
  websiteStaticPagePath,
} from './website-preview-renderer';

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

  it('renders commerce product-grid and gallery sections as static markup', () => {
    const commerce = WebsiteSpecSchema.parse({
      ...spec,
      pages: [
        {
          ...spec.pages[0],
          sections: [
            {
              columns: '3',
              eyebrow: 'This week',
              id: 'products-main',
              items: [
                {
                  availabilityLabel: 'In stock 18',
                  badge: 'New',
                  name: 'Drop-shoulder shirt',
                  price: 1680,
                  priceLabel: 'NT$1,680',
                  sku: 'AN-101',
                  variant: 'Mist / M',
                },
                { name: 'Cotton knit', priceLabel: 'NT$1,280' },
              ],
              title: 'New arrivals',
              type: 'product-grid',
            },
            {
              id: 'gallery-main',
              items: [{ caption: 'Morning' }, { caption: 'Material' }],
              layout: 'grid',
              title: 'Lookbook',
              type: 'gallery',
            },
            spec.pages[0]!.sections[1],
          ],
        },
      ],
    });
    const html = renderWebsitePreviewDocument(commerce, 'home');
    expect(html).toContain('class="card product-card"');
    expect(html).toContain('product-badge">New');
    expect(html).toContain('product-sku">AN-101');
    expect(html).toContain('Drop-shoulder shirt');
    expect(html).toContain('product-price">NT$1,680');
    expect(html).toContain('class="gallery gallery-grid"');
    expect(html).toContain('gallery-caption">Morning');
  });

  it('shows stock levels and disables add-to-bag for sold-out products', () => {
    const commerce = WebsiteSpecSchema.parse({
      ...spec,
      locale: 'zh-Hant',
      pages: [
        {
          ...spec.pages[0],
          sections: [
            {
              columns: '3',
              id: 'products-main',
              items: [
                { name: '現貨商品', price: 1680, priceLabel: 'NT$1,680', sku: 'IN-1', stock: 24 },
                { name: '低量商品', price: 1280, priceLabel: 'NT$1,280', sku: 'LO-1', stock: 3 },
                { name: '售完商品', price: 980, priceLabel: 'NT$980', sku: 'OUT-1', stock: 0 },
              ],
              title: '本週選品',
              type: 'product-grid',
            },
            spec.pages[0]!.sections[1],
          ],
        },
      ],
    });
    const html = renderWebsitePreviewDocument(commerce, 'home');
    expect(html).toContain('現貨 24 件');
    expect(html).toContain('stock-low">僅剩 3 件');
    expect(html).toContain('stock-out">售完');
    // In-stock and low-stock items are addable; the sold-out item is not.
    expect(html).toContain('data-stock="24"');
    expect(html).toContain('data-stock="3"');
    expect(html).toContain('product-add product-soldout');
    // The sold-out item renders no add button (so no data-stock="0").
    expect(html).not.toContain('data-stock="0"');
  });

  it('reduces displayed product stock by units already sold', () => {
    const commerce = WebsiteSpecSchema.parse({
      ...spec,
      locale: 'zh-Hant',
      pages: [
        {
          ...spec.pages[0],
          sections: [
            {
              columns: '2',
              id: 'products-main',
              items: [
                { name: '暢銷商品', price: 1000, priceLabel: 'NT$1,000', sku: 'S-1', stock: 10 },
                { name: '完售商品', price: 800, priceLabel: 'NT$800', sku: 'S-2', stock: 3 },
              ],
              title: '本週選品',
              type: 'product-grid',
            },
            spec.pages[0]!.sections[1],
          ],
        },
      ],
    });
    const live = applyInventorySold(
      commerce,
      new Map([
        ['S-1', 8],
        ['S-2', 3],
      ]),
    );
    const html = renderWebsitePreviewDocument(live, 'home');
    expect(html).toContain('僅剩 2 件'); // 10 published − 8 sold
    expect(html).toContain('stock-out">售完'); // 3 published − 3 sold
    expect(html).toContain('product-add product-soldout');
    // The original spec is not mutated by the render-time transform.
    const untouched = commerce.pages[0]!.sections[0]!;
    expect(untouched.type === 'product-grid' && untouched.items[0]?.stock).toBe(10);
  });

  it('renders a real product image when an item has an attached asset', () => {
    const withImage = WebsiteSpecSchema.parse({
      ...spec,
      assets: [
        { alt: 'Product photo', id: 'asset-p1', kind: 'project-asset', role: 'illustration' },
      ],
      pages: [
        {
          ...spec.pages[0],
          sections: [
            {
              columns: '2',
              id: 'products-main',
              items: [
                {
                  assetId: 'asset-p1',
                  name: 'Item A',
                  price: 1680,
                  priceLabel: 'NT$1,680',
                  sku: 'AN-1',
                },
                { name: 'Item B', price: 1280, priceLabel: 'NT$1,280', sku: 'AN-2' },
              ],
              title: 'Shop',
              type: 'product-grid',
            },
            spec.pages[0]!.sections[1],
          ],
        },
      ],
    });
    const html = renderWebsitePreviewDocument(
      withImage,
      'home',
      new Map([
        [
          'asset-p1',
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk',
        ],
      ]),
    );
    expect(html).toContain('class="asset-image"');
    expect(html).toContain('alt="Product photo"');
  });

  it('adds a hash-pinned cart only to pages that have a product-grid', () => {
    const commerce = WebsiteSpecSchema.parse({
      ...spec,
      pages: [
        {
          ...spec.pages[0],
          sections: [
            {
              columns: '2',
              id: 'products-main',
              items: [
                { name: 'Item A', price: 1680, priceLabel: 'NT$1,680', sku: 'AN-1' },
                { name: 'Item B', price: 1280, priceLabel: 'NT$1,280', sku: 'AN-2' },
              ],
              title: 'Shop',
              type: 'product-grid',
            },
            spec.pages[0]!.sections[1],
          ],
        },
      ],
    });
    const shop = renderWebsitePreviewDocument(commerce, 'home');
    // Add-to-cart buttons, header toggle, drawer, and exactly one script tag.
    expect(shop).toContain('data-add-cart');
    expect(shop).toContain('data-cart-toggle');
    expect(shop).toContain('data-cart-root');
    expect(shop.match(/<script>/gu)).toHaveLength(1);
    // A non-commerce page stays completely script-free.
    expect(renderWebsitePreviewDocument(spec, 'home')).not.toContain('<script');

    // Published: checkout posts a structured order into the same-origin orders pipeline.
    const published = renderWebsitePublishedDocument(commerce, 'home', 'product-site-a1000000');
    expect(published).toContain('class="cart-checkout-form"');
    expect(published).toContain('action="/api/public-sites/product-site-a1000000/checkout"');
    expect(published).toContain('data-cart-items-json');
    // Preview (no backend) keeps the anchor fallback, not a POST form.
    expect(shop).toContain('class="action cart-checkout" href="#contact"');
    expect(shop).not.toContain('<form class="cart-checkout-form"');
  });

  it('renders published navigation, managed content, and a same-origin contact form', () => {
    const html = renderWebsitePublishedDocument(
      spec,
      'home',
      'product-site-a1000000',
      new Map(),
      'platform-path',
      [
        {
          body: 'Managed content remains validated before public rendering.',
          contentKey: 'latest-news',
          createdAt: '2026-07-29T00:00:00.000Z',
          id: '10000000-0000-4000-8000-000000004211',
          pageSlug: 'home',
          projectId: '10000000-0000-4000-8000-000000004212',
          status: 'published',
          tenantId: '10000000-0000-4000-8000-000000004213',
          title: 'Latest news',
          updatedAt: '2026-07-29T00:00:00.000Z',
        },
      ],
      {
        href: '/api/public-sites/product-site-a1000000/auth?pageSlug=home',
        label: 'Member sign in',
      },
    );
    expect(html).toContain('content="index,follow"');
    expect(html).toContain('href="/s/product-site-a1000000/home"');
    expect(html).toContain('Latest news');
    expect(html).toContain('action="/api/public-sites/product-site-a1000000/contact"');
    expect(html).toContain('href="/api/public-sites/product-site-a1000000/auth?pageSlug=home"');
    expect(html).toContain('<form');
    expect(html).not.toContain('<script');
    expect(WEBSITE_PUBLIC_HEADERS['content-security-policy']).toContain(
      `script-src '${WEBSITE_CART_SCRIPT_SHA256}'`,
    );
    expect(WEBSITE_PUBLIC_HEADERS['content-security-policy']).not.toContain(
      "script-src 'unsafe-inline'",
    );
    expect(WEBSITE_PUBLIC_HEADERS['content-security-policy']).toContain("form-action 'self'");
    expect(WEBSITE_PUBLIC_HEADERS['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('renders wildcard-host navigation without leaking the platform path prefix', () => {
    const html = renderWebsitePublishedDocument(
      spec,
      'home',
      'product-site-a1000000',
      new Map(),
      'site-host',
    );
    expect(html).toContain('href="/home"');
    expect(html).not.toContain('href="/s/product-site-a1000000/home"');
  });

  it('renders only reviewed published data forms without executable code', () => {
    const html = renderWebsitePublishedDocument(
      spec,
      'home',
      'product-site-a1000000',
      new Map(),
      'platform-path',
      [],
      undefined,
      [
        {
          collection: {
            collectionKey: 'bookings',
            createdAt: '2026-07-29T00:00:00.000Z',
            fields: [
              {
                key: 'email',
                label: '電子郵件',
                options: [],
                referenceCollectionKey: null,
                required: true,
                type: 'email',
              },
              {
                key: 'seats',
                label: '人數',
                options: [],
                referenceCollectionKey: null,
                required: true,
                type: 'number',
              },
            ],
            id: '10000000-0000-4000-8000-000000004410',
            name: '預約',
            projectId: '10000000-0000-4000-8000-000000004411',
            reviewedAt: '2026-07-29T00:00:00.000Z',
            tenantId: '10000000-0000-4000-8000-000000004412',
            updatedAt: '2026-07-29T00:00:00.000Z',
          },
          form: {
            active: true,
            collectionKey: 'bookings',
            createdAt: '2026-07-29T00:00:00.000Z',
            fieldKeys: ['email', 'seats'],
            formKey: 'booking-form',
            id: '10000000-0000-4000-8000-000000004413',
            pageSlug: 'home',
            projectId: '10000000-0000-4000-8000-000000004411',
            requiredRole: null,
            submitLabel: '送出預約',
            successMessage: '已收到預約。',
            tenantId: '10000000-0000-4000-8000-000000004412',
            title: '預約諮詢',
            updatedAt: '2026-07-29T00:00:00.000Z',
            workflowTrigger: 'audit-record-created',
          },
        },
      ],
    );
    expect(html).toContain('action="/api/public-sites/product-site-a1000000/data/booking-form"');
    expect(html).toContain('name="field-email"');
    expect(html).toContain('name="field-seats"');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });

  it('renders portable static navigation to deterministic HTML files', () => {
    const multiPage = WebsiteSpecSchema.parse({
      ...spec,
      navigation: {
        ...spec.navigation,
        items: [
          { label: 'Home', pageSlug: 'home' },
          { label: 'Services', pageSlug: 'services' },
        ],
      },
      pages: [
        ...spec.pages,
        {
          metaDescription: 'A second portable website page for testing.',
          sections: [
            {
              body: 'Portable static content stays inside the downloaded archive.',
              id: 'services-content',
              layout: 'text',
              title: 'Services',
              type: 'content',
            },
          ],
          slug: 'services',
          title: 'Services',
        },
      ],
    });
    const html = renderWebsiteStaticDocument(multiPage, 'services');
    expect(websiteStaticPagePath(multiPage, 'home')).toBe('index.html');
    expect(websiteStaticPagePath(multiPage, 'services')).toBe('page-services.html');
    expect(html).toContain('href="index.html"');
    expect(html).toContain('href="page-services.html"');
    expect(html).not.toContain('/s/');
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

  it('locks the preview response to a single hash-pinned script and no network', () => {
    expect(WEBSITE_PREVIEW_HEADERS['content-security-policy']).toContain(
      `script-src '${WEBSITE_CART_SCRIPT_SHA256}'`,
    );
    expect(WEBSITE_PREVIEW_HEADERS['content-security-policy']).not.toContain(
      "script-src 'unsafe-inline'",
    );
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
