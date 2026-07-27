import { z } from 'zod';

import type { WebsiteBrief } from './website';

const UNSAFE_TEXT_PATTERN =
  /(?:https?:\/\/|javascript:|data:text\/html|<\s*script|```|(?:^|\s)(?:npm|pnpm|yarn|bun|bash|sh|python|node)\s+(?:run|exec|install|-[a-z]))/iu;

function safeText(minimum: number, maximum: number) {
  return z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) => !UNSAFE_TEXT_PATTERN.test(value), {
      message: 'Website text cannot contain code, commands, scripts, or external URLs.',
    });
}

const IdentifierSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);

const PageSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const WebsiteGenerationSelectionSchema = z.enum([
  'auto',
  'openai',
  'anthropic',
  'gemini',
  'mock',
]);

export const WebsiteGenerationProviderSchema = z.enum(['openai', 'anthropic', 'gemini', 'mock']);

export const WebsiteThemeSchema = z
  .object({
    appearance: z.enum(['light', 'dark', 'system']),
    density: z.enum(['airy', 'balanced', 'compact']),
    palette: z.enum(['indigo-mint', 'graphite-amber', 'navy-cyan', 'forest-sand', 'violet-rose']),
    radius: z.enum(['soft', 'rounded', 'pill']),
    typography: z.enum(['modern-sans', 'editorial', 'technical', 'friendly']),
  })
  .strict();

export const WebsiteAssetReferenceSchema = z
  .object({
    alt: safeText(1, 180),
    id: IdentifierSchema,
    kind: z.enum(['placeholder', 'project-asset']),
    role: z.enum(['hero', 'illustration', 'logo', 'portrait', 'product']),
  })
  .strict();

const WebsiteActionTargetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('page'),
      pageSlug: PageSlugSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('section'),
      sectionId: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      channel: z.enum(['email', 'form']),
      kind: z.literal('contact'),
    })
    .strict(),
]);

export const WebsiteActionSchema = z
  .object({
    label: safeText(1, 80),
    target: WebsiteActionTargetSchema,
  })
  .strict();

const SectionBaseSchema = z.object({
  id: IdentifierSchema,
});

const HeroSectionSchema = SectionBaseSchema.extend({
  assetId: IdentifierSchema.optional(),
  body: safeText(10, 700),
  eyebrow: safeText(1, 80).optional(),
  layout: z.enum(['centered', 'editorial', 'split']),
  primaryAction: WebsiteActionSchema,
  secondaryAction: WebsiteActionSchema.optional(),
  title: safeText(3, 140),
  type: z.literal('hero'),
}).strict();

const FeatureItemSchema = z
  .object({
    body: safeText(5, 300),
    icon: z.enum([
      'arrow',
      'chart',
      'check',
      'clock',
      'device',
      'document',
      'globe',
      'lock',
      'shield',
      'spark',
      'users',
      'workflow',
    ]),
    title: safeText(2, 80),
  })
  .strict();

const FeatureGridSectionSchema = SectionBaseSchema.extend({
  body: safeText(5, 400).optional(),
  columns: z.enum(['2', '3', '4']),
  items: z.array(FeatureItemSchema).min(2).max(8),
  title: safeText(3, 120),
  type: z.literal('feature-grid'),
}).strict();

const StatsSectionSchema = SectionBaseSchema.extend({
  items: z
    .array(
      z
        .object({
          label: safeText(1, 80),
          value: safeText(1, 40),
        })
        .strict(),
    )
    .min(2)
    .max(6),
  type: z.literal('stats'),
}).strict();

const TestimonialSectionSchema = SectionBaseSchema.extend({
  assetId: IdentifierSchema.optional(),
  attribution: safeText(2, 120),
  quote: safeText(10, 600),
  role: safeText(2, 120).optional(),
  type: z.literal('testimonial'),
}).strict();

const PricingSectionSchema = SectionBaseSchema.extend({
  body: safeText(5, 400).optional(),
  plans: z
    .array(
      z
        .object({
          action: WebsiteActionSchema,
          description: safeText(5, 240),
          features: z.array(safeText(1, 100)).min(1).max(10),
          highlighted: z.boolean(),
          name: safeText(1, 60),
          priceLabel: safeText(1, 60),
        })
        .strict(),
    )
    .min(1)
    .max(4),
  title: safeText(3, 120),
  type: z.literal('pricing'),
}).strict();

const FaqSectionSchema = SectionBaseSchema.extend({
  items: z
    .array(
      z
        .object({
          answer: safeText(5, 600),
          question: safeText(3, 160),
        })
        .strict(),
    )
    .min(1)
    .max(12),
  title: safeText(3, 120),
  type: z.literal('faq'),
}).strict();

const CtaSectionSchema = SectionBaseSchema.extend({
  action: WebsiteActionSchema,
  body: safeText(5, 400),
  secondaryAction: WebsiteActionSchema.optional(),
  title: safeText(3, 120),
  type: z.literal('cta'),
}).strict();

const ContentSectionSchema = SectionBaseSchema.extend({
  assetId: IdentifierSchema.optional(),
  body: safeText(10, 1_500),
  layout: z.enum(['image-left', 'image-right', 'text']),
  title: safeText(3, 120),
  type: z.literal('content'),
}).strict();

const FooterSectionSchema = SectionBaseSchema.extend({
  copyright: safeText(2, 160),
  links: z.array(WebsiteActionSchema).max(12),
  type: z.literal('footer'),
}).strict();

export const WebsiteSectionSchema = z.discriminatedUnion('type', [
  HeroSectionSchema,
  FeatureGridSectionSchema,
  StatsSectionSchema,
  TestimonialSectionSchema,
  PricingSectionSchema,
  FaqSectionSchema,
  CtaSectionSchema,
  ContentSectionSchema,
  FooterSectionSchema,
]);

export const WebsiteSpecPageSchema = z
  .object({
    metaDescription: safeText(10, 200),
    sections: z.array(WebsiteSectionSchema).min(1).max(24),
    slug: PageSlugSchema,
    title: safeText(1, 80),
  })
  .strict();

export const WebsiteSpecSchema = z
  .object({
    assets: z.array(WebsiteAssetReferenceSchema).max(30),
    locale: z.enum(['en', 'zh-Hant']),
    name: safeText(2, 120),
    navigation: z
      .object({
        brandLabel: safeText(1, 80),
        items: z
          .array(
            z
              .object({
                label: safeText(1, 60),
                pageSlug: PageSlugSchema,
              })
              .strict(),
          )
          .max(12),
      })
      .strict(),
    pages: z.array(WebsiteSpecPageSchema).min(1).max(12),
    schemaVersion: z.literal(1),
    theme: WebsiteThemeSchema,
  })
  .strict()
  .superRefine((spec, context) => {
    const pageSlugs = new Set<string>();
    const sectionIds = new Set<string>();
    const assetIds = new Set(spec.assets.map((asset) => asset.id));

    spec.pages.forEach((page, pageIndex) => {
      if (pageSlugs.has(page.slug)) {
        context.addIssue({
          code: 'custom',
          message: 'Website page slugs must be unique.',
          path: ['pages', pageIndex, 'slug'],
        });
      }
      pageSlugs.add(page.slug);
      page.sections.forEach((section, sectionIndex) => {
        if (sectionIds.has(section.id)) {
          context.addIssue({
            code: 'custom',
            message: 'Website section IDs must be unique.',
            path: ['pages', pageIndex, 'sections', sectionIndex, 'id'],
          });
        }
        sectionIds.add(section.id);
        if (
          'assetId' in section &&
          section.assetId !== undefined &&
          !assetIds.has(section.assetId)
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Website section asset references must exist.',
            path: ['pages', pageIndex, 'sections', sectionIndex, 'assetId'],
          });
        }
      });
    });

    const actions: { readonly action: WebsiteAction; readonly path: (number | string)[] }[] = [];
    spec.pages.forEach((page, pageIndex) => {
      page.sections.forEach((section, sectionIndex) => {
        const basePath = ['pages', pageIndex, 'sections', sectionIndex];
        if ('primaryAction' in section) {
          actions.push({ action: section.primaryAction, path: [...basePath, 'primaryAction'] });
        }
        if ('action' in section) {
          actions.push({ action: section.action, path: [...basePath, 'action'] });
        }
        if ('secondaryAction' in section && section.secondaryAction !== undefined) {
          actions.push({
            action: section.secondaryAction,
            path: [...basePath, 'secondaryAction'],
          });
        }
        if (section.type === 'pricing') {
          section.plans.forEach((plan, planIndex) => {
            actions.push({
              action: plan.action,
              path: [...basePath, 'plans', planIndex, 'action'],
            });
          });
        }
        if (section.type === 'footer') {
          section.links.forEach((action, linkIndex) => {
            actions.push({ action, path: [...basePath, 'links', linkIndex] });
          });
        }
      });
    });

    spec.navigation.items.forEach((item, index) => {
      if (!pageSlugs.has(item.pageSlug)) {
        context.addIssue({
          code: 'custom',
          message: 'Navigation targets must reference an existing page.',
          path: ['navigation', 'items', index, 'pageSlug'],
        });
      }
    });

    actions.forEach(({ action, path }) => {
      if (action.target.kind === 'page' && !pageSlugs.has(action.target.pageSlug)) {
        context.addIssue({
          code: 'custom',
          message: 'Page actions must reference an existing page.',
          path: [...path, 'target', 'pageSlug'],
        });
      }
      if (action.target.kind === 'section' && !sectionIds.has(action.target.sectionId)) {
        context.addIssue({
          code: 'custom',
          message: 'Section actions must reference an existing section.',
          path: [...path, 'target', 'sectionId'],
        });
      }
    });
  });

export const WebsiteSpecGenerationInputSchema = z
  .object({
    locale: z.enum(['en', 'zh-Hant']).default('zh-Hant'),
    model: WebsiteGenerationSelectionSchema.default('auto'),
    tier: z.enum(['auto', 'economy', 'standard', 'advanced', 'flagship']).default('auto'),
  })
  .strict();

export const WebsiteSpecVersionSourceSchema = z.enum([
  'direct',
  'generated',
  'natural-language',
  'restore',
]);

export const WebsiteVersionNameSchema = safeText(1, 80);

export const WebsiteSpecGenerationSchema = z
  .object({
    attempts: z.number().int().min(1).max(3),
    changeSummary: safeText(0, 300),
    createdAt: z.string().datetime({ offset: true }),
    model: z.string().min(1).max(120),
    parentVersion: z.number().int().min(1).optional(),
    provider: WebsiteGenerationProviderSchema,
    restoredFromVersion: z.number().int().min(1).optional(),
    source: WebsiteSpecVersionSourceSchema,
    spec: WebsiteSpecSchema,
    version: z.number().int().min(1),
    versionName: WebsiteVersionNameSchema,
  })
  .strict();

export const WebsiteSpecClientGenerationSchema = WebsiteSpecGenerationSchema.omit({
  model: true,
});

export const WEBSITE_SPEC_PROVIDER_JSON_SCHEMA = z.toJSONSchema(WebsiteSpecSchema);

const WebsiteThemePatchSchema = WebsiteThemeSchema.partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one website theme property must be supplied.',
  });

export const WebsiteSectionCopyFieldSchema = z.enum([
  'attribution',
  'body',
  'copyright',
  'eyebrow',
  'quote',
  'title',
]);

export const WebsiteDirectEditSchema = z.discriminatedUnion('type', [
  z
    .object({
      patch: WebsiteThemePatchSchema,
      type: z.literal('update-theme'),
    })
    .strict(),
  z
    .object({
      field: WebsiteSectionCopyFieldSchema,
      pageSlug: PageSlugSchema,
      sectionId: IdentifierSchema,
      type: z.literal('update-section-copy'),
      value: safeText(1, 1_500),
    })
    .strict(),
  z
    .object({
      direction: z.enum(['down', 'up']),
      pageSlug: PageSlugSchema,
      sectionId: IdentifierSchema,
      type: z.literal('move-section'),
    })
    .strict(),
  z
    .object({
      pageSlug: PageSlugSchema,
      sectionId: IdentifierSchema,
      type: z.literal('duplicate-section'),
    })
    .strict(),
]);

export const WebsiteSpecEditInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      edit: WebsiteDirectEditSchema,
      kind: z.literal('direct'),
      versionName: WebsiteVersionNameSchema,
    })
    .strict(),
  z
    .object({
      instruction: safeText(10, 1_000),
      kind: z.literal('natural-language'),
      locale: z.enum(['en', 'zh-Hant']).default('zh-Hant'),
      model: WebsiteGenerationSelectionSchema.default('auto'),
      tier: z.enum(['auto', 'economy', 'standard', 'advanced', 'flagship']).default('auto'),
      versionName: WebsiteVersionNameSchema,
    })
    .strict(),
]);

export const WebsiteSpecRestoreInputSchema = z
  .object({
    versionName: WebsiteVersionNameSchema,
  })
  .strict();

export interface WebsiteSpecComparison {
  readonly addedPages: readonly string[];
  readonly addedSections: number;
  readonly changedPages: readonly string[];
  readonly changedSections: number;
  readonly changedThemeProperties: readonly (keyof WebsiteSpec['theme'])[];
  readonly movedSections: number;
  readonly removedPages: readonly string[];
  readonly removedSections: number;
}

function stableValue(value: unknown): string {
  return JSON.stringify(value);
}

export function compareWebsiteSpecs(
  baseValue: WebsiteSpec,
  currentValue: WebsiteSpec,
): WebsiteSpecComparison {
  const base = WebsiteSpecSchema.parse(baseValue);
  const current = WebsiteSpecSchema.parse(currentValue);
  const basePages = new Map(base.pages.map((page) => [page.slug, page]));
  const currentPages = new Map(current.pages.map((page) => [page.slug, page]));
  const addedPages = current.pages
    .filter((page) => !basePages.has(page.slug))
    .map((page) => page.slug);
  const removedPages = base.pages
    .filter((page) => !currentPages.has(page.slug))
    .map((page) => page.slug);
  const changedPages = current.pages
    .filter((page) => {
      const previous = basePages.get(page.slug);
      return previous !== undefined && stableValue(previous) !== stableValue(page);
    })
    .map((page) => page.slug);
  let addedSections = 0;
  let removedSections = 0;
  let movedSections = 0;
  let changedSections = 0;

  for (const page of current.pages) {
    const previous = basePages.get(page.slug);
    if (previous === undefined) {
      addedSections += page.sections.length;
      continue;
    }
    const previousIndexes = new Map(previous.sections.map((section, index) => [section.id, index]));
    const currentIds = new Set(page.sections.map((section) => section.id));
    addedSections += page.sections.filter((section) => !previousIndexes.has(section.id)).length;
    removedSections += previous.sections.filter((section) => !currentIds.has(section.id)).length;
    page.sections.forEach((section, index) => {
      const previousIndex = previousIndexes.get(section.id);
      if (previousIndex === undefined) return;
      if (previousIndex !== index) movedSections += 1;
      const previousSection = previous.sections[previousIndex];
      if (previousSection !== undefined && stableValue(previousSection) !== stableValue(section)) {
        changedSections += 1;
      }
    });
  }
  for (const page of base.pages) {
    if (!currentPages.has(page.slug)) removedSections += page.sections.length;
  }

  return {
    addedPages,
    addedSections,
    changedPages,
    changedSections,
    changedThemeProperties: (
      Object.keys(base.theme) as readonly (keyof WebsiteSpec['theme'])[]
    ).filter((key) => base.theme[key] !== current.theme[key]),
    movedSections,
    removedPages,
    removedSections,
  };
}

export function createWebsiteSpecForBriefSchema(brief: WebsiteBrief) {
  const expectedSlugs = [...brief.pages.map((page) => page.slug)].sort();
  return WebsiteSpecSchema.superRefine((spec, context) => {
    const actualSlugs = [...spec.pages.map((page) => page.slug)].sort();
    if (
      expectedSlugs.length !== actualSlugs.length ||
      expectedSlugs.some((slug, index) => slug !== actualSlugs[index])
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Generated pages must exactly match the validated website brief.',
        path: ['pages'],
      });
    }
  });
}

export type WebsiteAction = z.infer<typeof WebsiteActionSchema>;
export type WebsiteGenerationProvider = z.infer<typeof WebsiteGenerationProviderSchema>;
export type WebsiteGenerationSelection = z.infer<typeof WebsiteGenerationSelectionSchema>;
export type WebsiteDirectEdit = z.infer<typeof WebsiteDirectEditSchema>;
export type WebsiteSection = z.infer<typeof WebsiteSectionSchema>;
export type WebsiteSpec = z.infer<typeof WebsiteSpecSchema>;
export type WebsiteSpecClientGeneration = z.infer<typeof WebsiteSpecClientGenerationSchema>;
export type WebsiteSpecEditInput = z.infer<typeof WebsiteSpecEditInputSchema>;
export type WebsiteSpecGeneration = z.infer<typeof WebsiteSpecGenerationSchema>;
export type WebsiteSpecGenerationInput = z.infer<typeof WebsiteSpecGenerationInputSchema>;
export type WebsiteSpecRestoreInput = z.infer<typeof WebsiteSpecRestoreInputSchema>;
export type WebsiteSpecVersionSource = z.infer<typeof WebsiteSpecVersionSourceSchema>;
