import type { WebsiteSpec } from '@ai-workflow-studio/website-schema';

export interface StorefrontImageTarget {
  readonly itemIndex: number;
  readonly name: string;
  readonly pageSlug: string;
  readonly sectionId: string;
}

/** Product-grid items on the site that do not yet have an attached image. */
export function collectStorefrontImageTargets(spec: WebsiteSpec): StorefrontImageTarget[] {
  const targets: StorefrontImageTarget[] = [];
  for (const page of spec.pages) {
    for (const section of page.sections) {
      if (section.type !== 'product-grid') continue;
      section.items.forEach((item, itemIndex) => {
        if (item.assetId === undefined) {
          targets.push({ itemIndex, name: item.name, pageSlug: page.slug, sectionId: section.id });
        }
      });
    }
  }
  return targets;
}

/** A safe, on-brand image prompt for a single product (no external URLs or code). */
export function buildProductImagePrompt(
  spec: WebsiteSpec,
  productName: string,
  locale: 'en' | 'zh-Hant',
): string {
  const brand = spec.navigation.brandLabel;
  const { appearance, palette } = spec.theme;
  const prompt =
    locale === 'en'
      ? `Editorial commerce product photo of "${productName}" for the brand ${brand}. ${palette} palette, ${appearance} mood, minimal studio backdrop, soft natural light, no text or logos.`
      : `${brand} 品牌的「${productName}」商品情境照，${palette} 色調、${appearance} 氛圍，簡約棚拍背景、柔和自然光、無文字或標誌。`;
  return prompt.replace(/https?:\/\/\S+/gu, '').slice(0, 1_200);
}
