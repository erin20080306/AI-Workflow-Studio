import { z } from 'zod';

export const WebsiteGithubAccountSchema = z
  .object({
    login: z.string().min(1).max(100),
    type: z.enum(['Organization', 'User']),
  })
  .strict();

export const WebsiteGithubConnectionSchema = z
  .object({
    account: WebsiteGithubAccountSchema,
    connectedAt: z.string().datetime({ offset: true }),
    installationId: z.string().regex(/^[1-9][0-9]{0,19}$/),
  })
  .strict();

export const WebsiteGithubStateSchema = z
  .object({
    configured: z.boolean(),
    connection: WebsiteGithubConnectionSchema.optional(),
  })
  .strict();

export const WebsiteGithubRepositorySchema = z
  .object({
    defaultBranch: z.string().min(1).max(255),
    fullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    id: z.string().regex(/^[1-9][0-9]{0,19}$/),
    private: z.boolean(),
  })
  .strict();

export const WebsiteGithubPushInputSchema = z
  .object({
    branch: z
      .string()
      .min(22)
      .max(96)
      .regex(/^ai-workflow-studio\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
    confirmed: z.literal(true),
    idempotencyKey: z.string().uuid(),
    repositoryId: z.string().regex(/^[1-9][0-9]{0,19}$/),
    version: z.number().int().min(1),
  })
  .strict();

export const WebsiteGithubPublicationSchema = z
  .object({
    branch: z.string().min(1).max(255),
    commitSha: z.string().regex(/^[a-f0-9]{40}$/),
    commitUrl: z.string().url(),
    repositoryFullName: z.string().min(3).max(220),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    version: z.number().int().min(1),
  })
  .strict();

export type WebsiteGithubConnection = z.infer<typeof WebsiteGithubConnectionSchema>;
export type WebsiteGithubAccount = z.infer<typeof WebsiteGithubAccountSchema>;
export type WebsiteGithubPublication = z.infer<typeof WebsiteGithubPublicationSchema>;
export type WebsiteGithubPushInput = z.infer<typeof WebsiteGithubPushInputSchema>;
export type WebsiteGithubRepository = z.infer<typeof WebsiteGithubRepositorySchema>;
export type WebsiteGithubState = z.infer<typeof WebsiteGithubStateSchema>;

export function githubBranchForSiteSlug(siteSlug: string): string {
  const normalized = siteSlug
    .normalize('NFKD')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 63)
    .replaceAll(/-+$/g, '');
  return `ai-workflow-studio/${normalized.length >= 3 ? normalized : 'generated-site'}`;
}
