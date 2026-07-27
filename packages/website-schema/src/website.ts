import { z } from 'zod';

export const WEBSITE_BRIEF_STEPS = [
  'purpose',
  'audience',
  'pages',
  'brandDirection',
  'content',
  'callsToAction',
] as const;

export const WebsiteBriefStepSchema = z.enum(WEBSITE_BRIEF_STEPS);
export const WebsiteProjectStatusSchema = z.enum(['briefing', 'draft', 'archived']);

export const WebsitePageSchema = z
  .object({
    goal: z.string().trim().min(3).max(500),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(80),
  })
  .strict();

const WebsitePageListSchema = z
  .array(WebsitePageSchema)
  .max(12)
  .superRefine((pages, context) => {
    const slugs = new Set<string>();
    pages.forEach((page, index) => {
      if (slugs.has(page.slug)) {
        context.addIssue({
          code: 'custom',
          message: 'Website page slugs must be unique.',
          path: [index, 'slug'],
        });
      }
      slugs.add(page.slug);
    });
  });

const CallToActionListSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(8)
  .superRefine((callsToAction, context) => {
    const normalized = new Set<string>();
    callsToAction.forEach((callToAction, index) => {
      const key = callToAction.toLocaleLowerCase();
      if (normalized.has(key)) {
        context.addIssue({
          code: 'custom',
          message: 'Calls to action must be unique.',
          path: [index],
        });
      }
      normalized.add(key);
    });
  });

export const WebsiteBriefDraftSchema = z
  .object({
    audience: z.string().trim().max(1_000).default(''),
    brandDirection: z.string().trim().max(1_000).default(''),
    callsToAction: CallToActionListSchema.default([]),
    content: z.string().trim().max(6_000).default(''),
    pages: WebsitePageListSchema.default([]),
    purpose: z.string().trim().max(1_000).default(''),
  })
  .strict();

export const WebsiteBriefPatchSchema = z
  .object({
    audience: z.string().trim().max(1_000).optional(),
    brandDirection: z.string().trim().max(1_000).optional(),
    callsToAction: CallToActionListSchema.optional(),
    content: z.string().trim().max(6_000).optional(),
    pages: WebsitePageListSchema.optional(),
    purpose: z.string().trim().max(1_000).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one website brief field must be supplied.',
  });

export const WebsiteBriefSchema = z
  .object({
    audience: z.string().trim().min(10).max(1_000),
    brandDirection: z.string().trim().min(10).max(1_000),
    callsToAction: CallToActionListSchema.min(1),
    content: z.string().trim().min(10).max(6_000),
    pages: WebsitePageListSchema.min(1),
    purpose: z.string().trim().min(10).max(1_000),
  })
  .strict();

export const WebsiteProjectCreateInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
  })
  .strict();

export const WebsiteProjectSchema = z
  .object({
    brief: WebsiteBriefDraftSchema,
    briefCompletedAt: z.string().datetime({ offset: true }).optional(),
    completedSteps: z.number().int().min(0).max(WEBSITE_BRIEF_STEPS.length),
    createdAt: z.string().datetime({ offset: true }),
    createdBy: z.string().uuid(),
    draftCreatedAt: z.string().datetime({ offset: true }).optional(),
    id: z.string().uuid(),
    name: z.string().min(2).max(120),
    slug: z.string().min(2).max(80),
    status: WebsiteProjectStatusSchema,
    tenantId: z.string().uuid(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export interface WebsiteBriefProgress {
  readonly complete: boolean;
  readonly completedSteps: number;
  readonly missingSteps: readonly WebsiteBriefStep[];
}

function isTextComplete(value: string): boolean {
  return value.trim().length >= 10;
}

export function websiteBriefProgress(input: WebsiteBriefDraft): WebsiteBriefProgress {
  const brief = WebsiteBriefDraftSchema.parse(input);
  const completed = new Set<WebsiteBriefStep>();
  if (isTextComplete(brief.purpose)) completed.add('purpose');
  if (isTextComplete(brief.audience)) completed.add('audience');
  if (brief.pages.length > 0) completed.add('pages');
  if (isTextComplete(brief.brandDirection)) completed.add('brandDirection');
  if (isTextComplete(brief.content)) completed.add('content');
  if (brief.callsToAction.length > 0) completed.add('callsToAction');
  const missingSteps = WEBSITE_BRIEF_STEPS.filter((step) => !completed.has(step));
  return {
    complete: missingSteps.length === 0,
    completedSteps: completed.size,
    missingSteps,
  };
}

export function completeWebsiteBrief(input: WebsiteBriefDraft): WebsiteBrief {
  return WebsiteBriefSchema.parse(WebsiteBriefDraftSchema.parse(input));
}

export type WebsiteBrief = z.infer<typeof WebsiteBriefSchema>;
export type WebsiteBriefDraft = z.infer<typeof WebsiteBriefDraftSchema>;
export type WebsiteBriefPatch = z.infer<typeof WebsiteBriefPatchSchema>;
export type WebsiteBriefStep = z.infer<typeof WebsiteBriefStepSchema>;
export type WebsitePage = z.infer<typeof WebsitePageSchema>;
export type WebsiteProject = z.infer<typeof WebsiteProjectSchema>;
export type WebsiteProjectCreateInput = z.infer<typeof WebsiteProjectCreateInputSchema>;
