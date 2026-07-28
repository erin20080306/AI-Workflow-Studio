import { z } from 'zod';

export const WebsitePublicationStatusSchema = z.enum(['active', 'superseded']);
export const WebsiteCustomDomainStatusSchema = z.enum([
  'active',
  'disabled',
  'failed',
  'pending_dns',
  'pending_ownership',
]);
export const WebsiteDnsRecordTypeSchema = z.enum(['A', 'CNAME', 'TXT']);

export const WebsiteDnsRecordSchema = z
  .object({
    name: z.string().trim().min(1).max(253),
    purpose: z.enum(['ownership', 'routing']),
    type: WebsiteDnsRecordTypeSchema,
    value: z.string().trim().min(1).max(1_024),
  })
  .strict();

export const WebsiteCustomDomainSchema = z
  .object({
    activatedAt: z.string().datetime({ offset: true }).optional(),
    createdAt: z.string().datetime({ offset: true }),
    dnsRecords: z.array(WebsiteDnsRecordSchema).max(4),
    fallbackUrl: z.string().url(),
    hostname: z.string().trim().min(4).max(253),
    id: z.string().uuid(),
    lastCheckedAt: z.string().datetime({ offset: true }).optional(),
    ownershipVerified: z.boolean(),
    projectId: z.string().uuid(),
    publicUrl: z.string().url(),
    routingVerified: z.boolean(),
    status: WebsiteCustomDomainStatusSchema,
  })
  .strict();

export const WebsiteCustomDomainClaimInputSchema = z
  .object({
    hostname: z.string().trim().min(4).max(253),
  })
  .strict();

export const WebsitePublishInputSchema = z
  .object({
    confirmed: z.literal(true),
    version: z.number().int().min(1),
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
export type WebsiteCustomDomain = z.infer<typeof WebsiteCustomDomainSchema>;
export type WebsiteCustomDomainClaimInput = z.infer<typeof WebsiteCustomDomainClaimInputSchema>;
export type WebsiteCustomDomainStatus = z.infer<typeof WebsiteCustomDomainStatusSchema>;
export type WebsiteDnsRecord = z.infer<typeof WebsiteDnsRecordSchema>;
