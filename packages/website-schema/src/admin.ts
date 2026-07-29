import { z } from 'zod';

const ContentKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);

const PageSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const WebsiteContentStatusSchema = z.enum(['draft', 'published']);
export const WebsiteSubmissionStatusSchema = z.enum(['new', 'read', 'archived']);

export const WebsiteContentEntrySchema = z
  .object({
    body: z.string().trim().min(1).max(8_000),
    contentKey: ContentKeySchema,
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    pageSlug: PageSlugSchema,
    projectId: z.string().uuid(),
    status: WebsiteContentStatusSchema,
    tenantId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const WebsiteContactSubmissionInputSchema = z
  .object({
    email: z.string().trim().email().max(254),
    message: z.string().trim().min(10).max(2_000),
    name: z.string().trim().min(1).max(120),
    pageSlug: PageSlugSchema,
    subject: z.string().trim().max(160).default(''),
    website: z.literal('').optional(),
  })
  .strict();

export const WebsiteFormSubmissionSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    email: z.string().email(),
    formKey: z.literal('contact'),
    id: z.string().uuid(),
    message: z.string().min(10).max(2_000),
    name: z.string().min(1).max(120),
    pageSlug: PageSlugSchema,
    projectId: z.string().uuid(),
    status: WebsiteSubmissionStatusSchema,
    subject: z.string().max(160),
    tenantId: z.string().uuid(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const WebsiteAdminMutationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('upsert-content'),
      body: z.string().trim().min(1).max(8_000),
      contentKey: ContentKeySchema,
      pageSlug: PageSlugSchema,
      status: WebsiteContentStatusSchema,
      title: z.string().trim().min(1).max(120),
    })
    .strict(),
  z
    .object({
      action: z.literal('update-submission'),
      status: WebsiteSubmissionStatusSchema,
      submissionId: z.string().uuid(),
    })
    .strict(),
]);

export const WebsiteAdminDashboardSchema = z
  .object({
    contentEntries: z.array(WebsiteContentEntrySchema).max(50),
    submissions: z.array(WebsiteFormSubmissionSchema).max(200),
  })
  .strict();

export type WebsiteAdminDashboard = z.infer<typeof WebsiteAdminDashboardSchema>;
export type WebsiteAdminMutation = z.infer<typeof WebsiteAdminMutationSchema>;
export type WebsiteContactSubmissionInput = z.infer<typeof WebsiteContactSubmissionInputSchema>;
export type WebsiteContentEntry = z.infer<typeof WebsiteContentEntrySchema>;
export type WebsiteContentStatus = z.infer<typeof WebsiteContentStatusSchema>;
export type WebsiteFormSubmission = z.infer<typeof WebsiteFormSubmissionSchema>;
export type WebsiteSubmissionStatus = z.infer<typeof WebsiteSubmissionStatusSchema>;
