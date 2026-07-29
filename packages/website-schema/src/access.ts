import { z } from 'zod';

const PageSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const EmailSchema = z.string().trim().toLowerCase().email().max(254);

const PasswordSchema = z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);

export const WebsiteSiteRoleSchema = z.enum(['member', 'staff', 'manager']);
export const WebsiteSiteMemberStatusSchema = z.enum(['active', 'suspended']);

export const WebsiteSiteAccessRuleSchema = z
  .object({
    pageSlug: PageSlugSchema,
    pageTitle: z.string().trim().min(1).max(120),
    requiredRole: WebsiteSiteRoleSchema.nullable(),
    suggestedRole: WebsiteSiteRoleSchema.nullable(),
  })
  .strict();

export const WebsiteSiteMemberSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    displayName: z.string().trim().min(1).max(120),
    email: EmailSchema,
    id: z.string().uuid(),
    role: WebsiteSiteRoleSchema,
    status: WebsiteSiteMemberStatusSchema,
    updatedAt: z.string().datetime({ offset: true }),
    userId: z.string().uuid(),
  })
  .strict();

export const WebsiteSiteAccessDashboardSchema = z
  .object({
    members: z.array(WebsiteSiteMemberSchema).max(100),
    registrationEnabled: z.boolean(),
    reviewedAt: z.string().datetime({ offset: true }).nullable(),
    rules: z.array(WebsiteSiteAccessRuleSchema).max(12),
  })
  .strict();

const MatrixRuleSchema = z
  .object({
    pageSlug: PageSlugSchema,
    requiredRole: WebsiteSiteRoleSchema.nullable(),
  })
  .strict();

export const WebsiteSiteAccessMutationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('save-matrix'),
      confirmed: z.literal(true),
      registrationEnabled: z.boolean(),
      rules: z
        .array(MatrixRuleSchema)
        .min(1)
        .max(12)
        .refine(
          (rules) => new Set(rules.map((rule) => rule.pageSlug)).size === rules.length,
          'Access-matrix pages must be unique.',
        ),
    })
    .strict(),
  z
    .object({
      action: z.literal('update-member'),
      memberId: z.string().uuid(),
      role: WebsiteSiteRoleSchema,
      status: WebsiteSiteMemberStatusSchema,
    })
    .strict(),
]);

const AuthBaseSchema = z.object({
  pageSlug: PageSlugSchema,
});

export const WebsiteSiteAuthInputSchema = z.discriminatedUnion('action', [
  AuthBaseSchema.extend({
    action: z.literal('login'),
    email: EmailSchema,
    password: z.string().min(1).max(128),
  }).strict(),
  AuthBaseSchema.extend({
    action: z.literal('register'),
    confirmPassword: z.string().min(1).max(128),
    displayName: z.string().trim().min(1).max(120),
    email: EmailSchema,
    password: PasswordSchema,
  })
    .strict()
    .refine((input) => input.password === input.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    }),
  AuthBaseSchema.extend({
    action: z.literal('logout'),
  }).strict(),
]);

export const WebsiteSiteIdentitySchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    email: EmailSchema,
    userId: z.string().uuid(),
  })
  .strict();

export type WebsiteSiteAccessDashboard = z.infer<typeof WebsiteSiteAccessDashboardSchema>;
export type WebsiteSiteAccessMutation = z.infer<typeof WebsiteSiteAccessMutationSchema>;
export type WebsiteSiteAccessRule = z.infer<typeof WebsiteSiteAccessRuleSchema>;
export type WebsiteSiteAuthInput = z.infer<typeof WebsiteSiteAuthInputSchema>;
export type WebsiteSiteIdentity = z.infer<typeof WebsiteSiteIdentitySchema>;
export type WebsiteSiteMember = z.infer<typeof WebsiteSiteMemberSchema>;
export type WebsiteSiteMemberStatus = z.infer<typeof WebsiteSiteMemberStatusSchema>;
export type WebsiteSiteRole = z.infer<typeof WebsiteSiteRoleSchema>;
