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
export const WebsiteOrderStatusSchema = z.enum([
  'pending',
  'paid',
  'shipped',
  'completed',
  'cancelled',
]);

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

/** A single validated line on a stored order (server-authoritative pricing). */
export const WebsiteOrderItemSchema = z
  .object({
    currency: z.string().min(0).max(8),
    lineTotal: z.number().nonnegative().max(1_000_000_000_000),
    name: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(999),
    sku: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/)
      .optional(),
    unitPrice: z.number().nonnegative().max(1_000_000_000),
  })
  .strict();

export const WebsiteOrderSchema = z
  .object({
    buyerEmail: z.string().email(),
    buyerName: z.string().min(1).max(120),
    createdAt: z.string().datetime({ offset: true }),
    currency: z.string().min(0).max(8),
    id: z.string().uuid(),
    itemCount: z.number().int().min(1).max(50_000),
    items: z.array(WebsiteOrderItemSchema).min(1).max(50),
    pageSlug: PageSlugSchema,
    projectId: z.string().uuid(),
    status: WebsiteOrderStatusSchema,
    subtotal: z.number().nonnegative().max(1_000_000_000_000),
    tenantId: z.string().uuid(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

/** Untrusted checkout line from a storefront cart; the server re-prices it. */
export const WebsiteCheckoutItemInputSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(100),
    quantity: z.coerce.number().int().min(1).max(999),
  })
  .strip();

export const WebsiteCheckoutInputSchema = z
  .object({
    email: z.string().trim().email().max(254),
    items: z.array(WebsiteCheckoutItemInputSchema).min(1).max(50),
    name: z.string().trim().min(1).max(120),
    pageSlug: PageSlugSchema,
    website: z.literal('').optional(),
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
  z
    .object({
      action: z.literal('update-order-status'),
      orderId: z.string().uuid(),
      status: WebsiteOrderStatusSchema,
    })
    .strict(),
]);

export const WebsiteAdminDashboardSchema = z
  .object({
    contentEntries: z.array(WebsiteContentEntrySchema).max(50),
    orders: z.array(WebsiteOrderSchema).max(200),
    submissions: z.array(WebsiteFormSubmissionSchema).max(200),
  })
  .strict();

export type WebsiteAdminDashboard = z.infer<typeof WebsiteAdminDashboardSchema>;
export type WebsiteAdminMutation = z.infer<typeof WebsiteAdminMutationSchema>;
export type WebsiteCheckoutInput = z.infer<typeof WebsiteCheckoutInputSchema>;
export type WebsiteContactSubmissionInput = z.infer<typeof WebsiteContactSubmissionInputSchema>;
export type WebsiteContentEntry = z.infer<typeof WebsiteContentEntrySchema>;
export type WebsiteContentStatus = z.infer<typeof WebsiteContentStatusSchema>;
export type WebsiteFormSubmission = z.infer<typeof WebsiteFormSubmissionSchema>;
export type WebsiteOrder = z.infer<typeof WebsiteOrderSchema>;
export type WebsiteOrderItem = z.infer<typeof WebsiteOrderItemSchema>;
export type WebsiteOrderStatus = z.infer<typeof WebsiteOrderStatusSchema>;
export type WebsiteSubmissionStatus = z.infer<typeof WebsiteSubmissionStatusSchema>;
