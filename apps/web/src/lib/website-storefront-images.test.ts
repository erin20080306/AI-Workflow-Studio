import { WebsiteSpecSchema } from '@ai-workflow-studio/website-schema';
import { describe, expect, it } from 'vitest';

import {
  buildProductImagePrompt,
  collectStorefrontImageTargets,
} from './website-storefront-images';

const spec = WebsiteSpecSchema.parse({
  assets: [{ alt: 'Existing', id: 'asset-existing', kind: 'project-asset', role: 'illustration' }],
  locale: 'zh-Hant',
  name: 'ATELIER NOIR',
  navigation: { brandLabel: 'ATELIER NOIR', items: [{ label: '首頁', pageSlug: 'home' }] },
  pages: [
    {
      metaDescription: '以自然材質與安靜輪廓組成的日常衣櫥。',
      sections: [
        {
          columns: '3',
          id: 'products-main',
          items: [
            { assetId: 'asset-existing', name: '已有圖商品', priceLabel: 'NT$1,000' },
            { name: '雲感落肩襯衫', priceLabel: 'NT$1,680', sku: 'AN-101' },
            { name: '有機棉針織衫', priceLabel: 'NT$1,280', sku: 'AN-330' },
          ],
          title: '本週新品',
          type: 'product-grid',
        },
        {
          copyright: 'ATELIER NOIR',
          id: 'footer-main',
          links: [{ label: '首頁', target: { kind: 'page', pageSlug: 'home' } }],
          type: 'footer',
        },
      ],
      slug: 'home',
      title: '首頁',
    },
  ],
  schemaVersion: 1,
  theme: {
    appearance: 'light',
    density: 'airy',
    palette: 'graphite-amber',
    radius: 'soft',
    typography: 'editorial',
  },
});

describe('storefront image auto-fill helpers', () => {
  it('targets only product items that lack an image', () => {
    const targets = collectStorefrontImageTargets(spec);
    expect(targets.map((target) => target.name)).toEqual(['雲感落肩襯衫', '有機棉針織衫']);
    expect(targets[0]).toMatchObject({
      itemIndex: 1,
      pageSlug: 'home',
      sectionId: 'products-main',
    });
  });

  it('builds an on-brand, safe prompt with no external URLs', () => {
    const prompt = buildProductImagePrompt(spec, '雲感落肩襯衫', 'zh-Hant');
    expect(prompt).toContain('ATELIER NOIR');
    expect(prompt).toContain('雲感落肩襯衫');
    expect(prompt).not.toMatch(/https?:\/\//u);
    expect(prompt.length).toBeGreaterThanOrEqual(10);
    expect(prompt.length).toBeLessThanOrEqual(1_200);
  });
});
