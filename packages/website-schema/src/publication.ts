import { z } from 'zod';

export const WebsitePublicationStatusSchema = z.enum(['active', 'superseded']);

export const WebsitePublishInputSchema = z
  .object({
    confirmed: z.literal(true),
    siteSlug: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    version: z.number().int().min(1),
  })
  .strict();

export const WebsiteSiteSlugAvailabilitySchema = z
  .object({
    available: z.boolean(),
    normalizedSlug: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    publicUrl: z.string().url(),
  })
  .strict();

export const WebsitePublicationSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    publicPath: z.string().regex(/^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
    publishedAt: z.string().datetime({ offset: true }),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    status: WebsitePublicationStatusSchema,
    supersededAt: z.string().datetime({ offset: true }).optional(),
    version: z.number().int().min(1),
  })
  .strict();

export type WebsitePublication = z.infer<typeof WebsitePublicationSchema>;
export type WebsitePublicationStatus = z.infer<typeof WebsitePublicationStatusSchema>;
export type WebsitePublishInput = z.infer<typeof WebsitePublishInputSchema>;
export type WebsiteSiteSlugAvailability = z.infer<typeof WebsiteSiteSlugAvailabilitySchema>;
