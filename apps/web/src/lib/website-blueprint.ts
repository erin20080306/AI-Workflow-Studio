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

const BlueprintMetricSchema = z
  .object({
    label: blueprintText(1, 80),
    value: blueprintText(1, 40),
  })
  .strip();

const BlueprintPlanSchema = z
  .object({
    description: blueprintText(5, 240),
    features: z.array(blueprintText(1, 100)).min(1).max(10),
    highlighted: z.boolean().optional(),
    name: blueprintText(1, 60),
    priceLabel: blueprintText(1, 60),
  })
  .strip();

const BlueprintQuestionSchema = z
  .object({
    answer: blueprintText(5, 600),
    question: blueprintText(3, 160),
  })
  .strip();

const WebsiteBlueprintSectionSchema = z
  .object({
    attribution: blueprintText(2, 120).optional(),
    body: blueprintText(0, 1_500),
    eyebrow: blueprintText(1, 80).optional(),
    items: z.array(BlueprintFeatureSchema).max(6).optional(),
    layout: z
      .enum(['centered', 'editorial', 'image-left', 'image-right', 'split', 'text'])
      .optional(),
    metrics: z.array(BlueprintMetricSchema).max(6).optional(),
    plans: z.array(BlueprintPlanSchema).max(4).optional(),
    questions: z.array(BlueprintQuestionSchema).max(12).optional(),
    quote: blueprintText(10, 600).optional(),
    role: blueprintText(2, 120).optional(),
    title: blueprintText(0, 140),
    type: z.enum([
      'cta',
      'feature-grid',
      'hero',
      'content',
      'stats',
      'testimonial',
      'pricing',
      'faq',
    ]),
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

/** Pad/clamp text so it satisfies a spec section's min/max length bounds. */
function boundedText(value: string, min: number, max: number, filler: string): string {
  let text = value.trim().slice(0, max);
  while (text.length < min) text = `${text} ${filler}`.trim().slice(0, max);
  return text;
}

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
    case 'stats': {
      const metrics = section.metrics ?? [];
      const filled =
        metrics.length >= 2
          ? metrics
          : [
              ...metrics,
              {
                label: boundedText(title || primaryActionLabel, 1, 80, primaryActionLabel),
                value: '100%',
              },
              {
                label: boundedText(eyebrow || primaryActionLabel, 1, 80, primaryActionLabel),
                value: '24/7',
              },
            ];
      return {
        id,
        items: filled.slice(0, 6).map((metric) => ({
          label: boundedText(metric.label, 1, 80, primaryActionLabel),
          value: boundedText(metric.value, 1, 40, '—'),
        })),
        type: 'stats',
      };
    }
    case 'testimonial':
      return {
        attribution: boundedText(
          section.attribution ?? eyebrow ?? title,
          2,
          120,
          primaryActionLabel,
        ),
        id,
        quote: boundedText(section.quote ?? body ?? title, 10, 600, primaryActionLabel),
        ...(section.role !== undefined && section.role.length >= 2 ? { role: section.role } : {}),
        type: 'testimonial',
      };
    case 'pricing': {
      const contactAction = {
        label: primaryActionLabel,
        target: { channel: 'form' as const, kind: 'contact' as const },
      };
      const plans = (section.plans ?? []).slice(0, 4).map((plan) => ({
        action: contactAction,
        description: boundedText(plan.description, 5, 240, primaryActionLabel),
        features: plan.features.slice(0, 10),
        highlighted: plan.highlighted ?? false,
        name: boundedText(plan.name, 1, 60, primaryActionLabel),
        priceLabel: boundedText(plan.priceLabel, 1, 60, '—'),
      }));
      return {
        ...(body.length >= 5 ? { body } : {}),
        id,
        plans:
          plans.length >= 1
            ? plans
            : [
                {
                  action: contactAction,
                  description: boundedText(body || title, 5, 240, primaryActionLabel),
                  features: [boundedText(title || primaryActionLabel, 1, 100, primaryActionLabel)],
                  highlighted: true,
                  name: boundedText(title || primaryActionLabel, 1, 60, primaryActionLabel),
                  priceLabel: '—',
                },
              ],
        title,
        type: 'pricing',
      };
    }
    case 'faq': {
      const questions = (section.questions ?? []).slice(0, 12);
      return {
        id,
        items:
          questions.length >= 1
            ? questions.map((entry) => ({
                answer: boundedText(entry.answer, 5, 600, primaryActionLabel),
                question: boundedText(entry.question, 3, 160, primaryActionLabel),
              }))
            : [
                {
                  answer: boundedText(body || title, 5, 600, primaryActionLabel),
                  question: boundedText(title || primaryActionLabel, 3, 160, primaryActionLabel),
                },
              ],
        title,
        type: 'faq',
      };
    }
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
