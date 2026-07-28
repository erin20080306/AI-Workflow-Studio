import {
  WebsiteSpecSchema,
  createWebsiteSpecForBriefSchema,
  type WebsiteBrief,
  type WebsiteProject,
  type WebsiteSpec,
} from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { createSafeWebsiteSpec } from './website-safe-fallback';

const UNSAFE_BLUEPRINT_TEXT =
  /(?:https?:\/\/|javascript:|data:text\/html|<\s*script|```|(?:^|\s)(?:npm|pnpm|yarn|bun|bash|sh|python|node)\s+(?:run|exec|install|-[a-z]))/iu;

function blueprintText(minimum: number, maximum: number) {
  return z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) => !UNSAFE_BLUEPRINT_TEXT.test(value), {
      message: 'Website blueprint text cannot contain code, commands, scripts, or external URLs.',
    });
}

const BlueprintFeatureSchema = z
  .object({
    body: blueprintText(5, 300),
    title: blueprintText(2, 80),
  })
  .strip();

const WebsiteBlueprintSectionSchema = z
  .object({
    body: blueprintText(0, 1_500),
    eyebrow: blueprintText(1, 80).optional(),
    items: z.array(BlueprintFeatureSchema).max(6).optional(),
    layout: z
      .enum(['centered', 'editorial', 'image-left', 'image-right', 'split', 'text'])
      .optional(),
    title: blueprintText(0, 140),
    type: z.enum(['cta', 'feature-grid', 'hero', 'content']),
  })
  .strip();

const WebsiteBlueprintPageSchema = z
  .object({
    metaDescription: blueprintText(10, 200),
    sections: z.array(WebsiteBlueprintSectionSchema).min(1).max(8),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: blueprintText(1, 80),
  })
  .strip();

export const WebsiteBlueprintSchema = z
  .object({
    name: blueprintText(2, 120),
    pages: z.array(WebsiteBlueprintPageSchema).min(1).max(12),
    theme: z
      .object({
        appearance: z.enum(['light', 'dark', 'system']),
        density: z.enum(['airy', 'balanced', 'compact']),
        palette: z.enum([
          'indigo-mint',
          'graphite-amber',
          'navy-cyan',
          'forest-sand',
          'violet-rose',
        ]),
        radius: z.enum(['soft', 'rounded', 'pill']),
        typography: z.enum(['modern-sans', 'editorial', 'technical', 'friendly']),
      })
      .strip(),
  })
  .strip();

export const WEBSITE_BLUEPRINT_PROVIDER_JSON_SCHEMA = z.toJSONSchema(WebsiteBlueprintSchema);

export type WebsiteBlueprint = z.infer<typeof WebsiteBlueprintSchema>;

function unwrapWebsiteBlueprint(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 1) return value[0];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1) return value;
  const wrapper = record.blueprint ?? record.website;
  return typeof wrapper === 'object' && wrapper !== null && !Array.isArray(wrapper)
    ? wrapper
    : value;
}

export const WebsiteBlueprintOutputSchema = z.preprocess(
  unwrapWebsiteBlueprint,
  WebsiteBlueprintSchema,
);

const FEATURE_ICONS = ['spark', 'check', 'users', 'workflow', 'shield', 'clock'] as const;

function sectionId(
  pageSlug: string,
  type: WebsiteBlueprint['pages'][number]['sections'][number]['type'],
  index: number,
) {
  return `${pageSlug}-${type}-${index + 1}`;
}

function compileSection(
  pageSlug: string,
  section: WebsiteBlueprint['pages'][number]['sections'][number],
  index: number,
  primaryActionLabel: string,
): WebsiteSpec['pages'][number]['sections'][number] {
  const id = sectionId(pageSlug, section.type, index);
  const title = section.title.length >= 3 ? section.title : primaryActionLabel;
  const body = section.body.length >= 5 ? section.body : `${title} — ${primaryActionLabel}`;
  const eyebrow = section.eyebrow ?? '';
  const items = section.items ?? [];
  switch (section.type) {
    case 'hero':
      return {
        body,
        ...(eyebrow.length === 0 ? {} : { eyebrow }),
        id,
        layout:
          section.layout === 'centered' ||
          section.layout === 'editorial' ||
          section.layout === 'split'
            ? section.layout
            : 'split',
        primaryAction: {
          label: primaryActionLabel,
          target: { channel: 'form', kind: 'contact' },
        },
        title,
        type: 'hero',
      };
    case 'feature-grid':
      return {
        body,
        columns: items.length >= 4 ? '4' : items.length === 2 ? '2' : '3',
        id,
        items: (items.length >= 2
          ? items
          : [
              { body, title },
              {
                body,
                title: eyebrow.length >= 2 ? eyebrow : `${title.slice(0, 76)} 2`,
              },
            ]
        ).map((item, itemIndex) => ({
          ...item,
          icon: FEATURE_ICONS[itemIndex % FEATURE_ICONS.length] ?? 'spark',
        })),
        title,
        type: 'feature-grid',
      };
    case 'cta':
      return {
        action: {
          label: primaryActionLabel,
          target: { channel: 'form', kind: 'contact' },
        },
        body,
        id,
        title,
        type: 'cta',
      };
    case 'content':
      return {
        body,
        id,
        layout:
          section.layout === 'image-left' ||
          section.layout === 'image-right' ||
          section.layout === 'text'
            ? section.layout
            : 'text',
        title,
        type: 'content',
      };
  }
}

export function compileWebsiteBlueprint(
  project: WebsiteProject,
  brief: WebsiteBrief,
  locale: 'en' | 'zh-Hant',
  blueprintValue: WebsiteBlueprint,
  baseSpecValue?: WebsiteSpec,
): WebsiteSpec {
  const blueprint = WebsiteBlueprintSchema.parse(blueprintValue);
  const base =
    baseSpecValue === undefined
      ? createSafeWebsiteSpec(project, brief, locale)
      : WebsiteSpecSchema.parse(structuredClone(baseSpecValue));
  const primaryActionLabel =
    brief.callsToAction[0] ?? (locale === 'en' ? 'Contact us' : '立即聯絡');
  const blueprintPages = new Map(blueprint.pages.map((page) => [page.slug, page]));
  base.name = blueprint.name;
  base.theme = blueprint.theme;
  base.pages = base.pages.map((page) => {
    const planned = blueprintPages.get(page.slug);
    if (planned === undefined) return page;
    const footer = page.sections.find((section) => section.type === 'footer');
    const compiled = planned.sections.map((section, index) =>
      compileSection(page.slug, section, index, primaryActionLabel),
    );
    return {
      ...page,
      metaDescription: planned.metaDescription,
      sections: footer === undefined ? compiled : [...compiled, footer],
      title: planned.title,
    };
  });
  return createWebsiteSpecForBriefSchema(brief).parse(base);
}
