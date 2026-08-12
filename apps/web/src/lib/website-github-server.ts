import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  GithubAppError,
  listGithubInstallationRepositories,
  pushGithubStaticSource,
} from '@/lib/github-app-client';
import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import {
  WebsiteGithubConnectionSchema,
  WebsiteGithubPublicationSchema,
  type WebsiteGithubAccount,
  type WebsiteGithubConnection,
  type WebsiteGithubPublication,
  type WebsiteGithubPushInput,
  type WebsiteGithubRepository,
  type WebsiteGithubState,
} from '@/lib/website-github-schema';
import {
  assertWebsiteGithubSourceSafe,
  assertWebsiteNextSourceSafe,
} from '@/lib/website-github-source-safety';
import { prepareWebsiteNextSource } from '@/lib/website-nextjs-export-server';
import { prepareWebsiteStaticSource } from '@/lib/website-static-export-server';
import { getWebsiteProject, WebsiteStudioError } from '@/lib/website-studio-server';

const ConnectionRowSchema = z.object({
  account_login: z.string().min(1).max(100),
  account_type: z.enum(['Organization', 'User']),
  connected_at: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
  installation_id: z.number().int().positive(),
});

const PublicationRowSchema = z.object({
  branch: z.string().min(1).max(96),
  commit_sha: z.string().regex(/^[a-f0-9]{40}$/),
  repository_full_name: z.string().min(3).max(220),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  spec_version: z.number().int().min(1),
  status: z.literal('succeeded'),
});

const ExistingPublicationSchema = z.object({
  branch: z.string().min(1).max(96),
  commit_sha: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .nullable(),
  repository_full_name: z.string().min(3).max(220),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  spec_version: z.number().int().min(1),
  status: z.enum(['pending', 'succeeded', 'failed']),
});

const MOCK_CONNECTION_ID = '10000000-0000-4000-8000-000000000938';
const MOCK_CONNECTION: WebsiteGithubConnection = WebsiteGithubConnectionSchema.parse({
  account: { login: 'virtual-automation-team', type: 'Organization' },
  connectedAt: '2026-07-28T00:00:00.000Z',
  installationId: '938001',
});
const MOCK_REPOSITORY: WebsiteGithubRepository = {
  defaultBranch: 'main',
  fullName: 'virtual-automation-team/operations-showcase',
  id: '938002',
  private: true,
};

const githubGlobal = globalThis as typeof globalThis & {
  __aiWorkflowGithubPublications?: Map<string, WebsiteGithubPublication>;
};

function mockPublications(): Map<string, WebsiteGithubPublication> {
  githubGlobal.__aiWorkflowGithubPublications ??= new Map();
  return githubGlobal.__aiWorkflowGithubPublications;
}

function assertGithubAccess(context: WorkspaceContext): void {
  if (!['owner', 'admin'].includes(context.actor.role)) {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'Only workspace owners and administrators may publish website source to GitHub.',
    );
  }
  if (
    !context.platformAdmin &&
    (context.subscription.plan === 'free' ||
      !['active', 'past_due'].includes(context.subscription.status))
  ) {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'GitHub website publishing requires an active paid subscription.',
    );
  }
}

function connectionView(row: z.infer<typeof ConnectionRowSchema>): WebsiteGithubConnection {
  return WebsiteGithubConnectionSchema.parse({
    account: { login: row.account_login, type: row.account_type },
    connectedAt: row.connected_at,
    installationId: String(row.installation_id),
  });
}

async function connectionRecord(context: WorkspaceContext): Promise<
  | {
      readonly id: string;
      readonly view: WebsiteGithubConnection;
    }
  | undefined
> {
  if (getEnvironment().mockMode) return { id: MOCK_CONNECTION_ID, view: MOCK_CONNECTION };
  const result = await createSupabaseAdminClient()
    .from('website_github_connections')
    .select('id, installation_id, account_login, account_type, connected_at')
    .eq('tenant_id', context.actor.tenantId)
    .is('revoked_at', null)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The GitHub App connection could not be loaded.',
    );
  }
  if (result.data === null) return undefined;
  const row = ConnectionRowSchema.parse(result.data);
  return { id: row.id, view: connectionView(row) };
}

export async function getWebsiteGithubState(
  context: WorkspaceContext,
): Promise<WebsiteGithubState> {
  assertGithubAccess(context);
  const configured = getEnvironment().mockMode || getEnvironment().github.configured;
  if (!configured) return { configured: false };
  const connection = await connectionRecord(context);
  return {
    configured: true,
    ...(connection === undefined ? {} : { connection: connection.view }),
  };
}

export async function connectWebsiteGithubInstallation(
  context: WorkspaceContext,
  input: {
    readonly account: WebsiteGithubAccount;
    readonly installationId: string;
  },
): Promise<void> {
  assertGithubAccess(context);
  if (getEnvironment().mockMode) return;
  const installationId = z
    .string()
    .regex(/^[1-9][0-9]{0,19}$/)
    .parse(input.installationId);
  const admin = createSupabaseAdminClient();
  const existing = await admin
    .from('website_github_connections')
    .select('id')
    .eq('tenant_id', context.actor.tenantId)
    .eq('installation_id', Number(installationId))
    .is('revoked_at', null)
    .maybeSingle();
  if (existing.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The GitHub App connection could not be checked.',
    );
  }
  const mutation =
    existing.data === null
      ? await admin.from('website_github_connections').insert({
          account_login: input.account.login,
          account_type: input.account.type,
          connected_by: context.actor.userId,
          installation_id: Number(installationId),
          tenant_id: context.actor.tenantId,
        })
      : await admin
          .from('website_github_connections')
          .update({
            account_login: input.account.login,
            account_type: input.account.type,
            connected_by: context.actor.userId,
          })
          .eq('id', z.string().uuid().parse(existing.data.id))
          .eq('tenant_id', context.actor.tenantId);
  if (mutation.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The GitHub App connection could not be saved.',
    );
  }
}

export async function disconnectWebsiteGithub(context: WorkspaceContext): Promise<void> {
  assertGithubAccess(context);
  if (getEnvironment().mockMode) return;
  const record = await connectionRecord(context);
  if (record === undefined) return;
  const result = await createSupabaseAdminClient()
    .from('website_github_connections')
    .update({ revoked_at: new Date().toISOString() })
    .eq('tenant_id', context.actor.tenantId)
    .eq('id', record.id)
    .is('revoked_at', null);
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The GitHub App connection could not be disconnected.',
    );
  }
}

export async function listWebsiteGithubRepositories(
  context: WorkspaceContext,
): Promise<readonly WebsiteGithubRepository[]> {
  assertGithubAccess(context);
  const record = await connectionRecord(context);
  if (record === undefined) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'Connect the GitHub App before selecting a repository.',
    );
  }
  if (getEnvironment().mockMode) return [MOCK_REPOSITORY];
  try {
    return await listGithubInstallationRepositories(record.view.installationId);
  } catch (error) {
    throw new WebsiteStudioError(
      'WEBSITE_PROVIDER_UNAVAILABLE',
      'GitHub repositories could not be loaded.',
      { cause: error },
    );
  }
}

function publicationView(value: unknown): WebsiteGithubPublication {
  const row = PublicationRowSchema.parse(value);
  return WebsiteGithubPublicationSchema.parse({
    branch: row.branch,
    commitSha: row.commit_sha,
    commitUrl: `https://github.com/${row.repository_full_name}/commit/${row.commit_sha}`,
    repositoryFullName: row.repository_full_name,
    sourceSha256: row.source_sha256,
    version: row.spec_version,
  });
}

async function auditGithubPush(
  context: WorkspaceContext,
  input: {
    readonly branch: string;
    readonly commitSha?: string;
    readonly errorCode?: string;
    readonly projectId: string;
    readonly repositoryFullName: string;
    readonly repositoryId: string;
    readonly sourceSha256: string;
    readonly status: 'failed' | 'succeeded';
    readonly version: number;
  },
): Promise<void> {
  if (getEnvironment().mockMode) return;
  const result = await createSupabaseAdminClient()
    .from('audit_logs')
    .insert({
      action: `website.github.${input.status}`,
      actor_user_id: context.actor.userId,
      correlation_id: input.projectId,
      metadata: {
        branch: input.branch,
        ...(input.commitSha === undefined ? {} : { commitSha: input.commitSha }),
        ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
        repositoryFullName: input.repositoryFullName,
        repositoryId: input.repositoryId,
        sourceSha256: input.sourceSha256,
        status: input.status,
        version: input.version,
      },
      resource_id: input.projectId,
      resource_type: 'website_project',
      tenant_id: context.actor.tenantId,
    });
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The GitHub publishing result could not be audited.',
    );
  }
}

export async function publishWebsiteVersionToGithub(
  context: WorkspaceContext,
  projectId: string,
  input: WebsiteGithubPushInput,
): Promise<WebsiteGithubPublication> {
  assertGithubAccess(context);
  await getWebsiteProject(context, projectId);
  const prepared =
    input.format === 'next-app'
      ? await prepareWebsiteNextSource(context, projectId, input.version)
      : await prepareWebsiteStaticSource(context, projectId, input.version);
  if (input.format === 'next-app') {
    assertWebsiteNextSourceSafe(prepared.source);
  } else {
    assertWebsiteGithubSourceSafe(prepared.source);
  }
  const connection = await connectionRecord(context);
  if (connection === undefined) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'Connect the GitHub App before publishing.',
    );
  }
  const repositories = await listWebsiteGithubRepositories(context);
  const repository = repositories.find((candidate) => candidate.id === input.repositoryId);
  if (repository === undefined) {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'The selected repository is not available to this GitHub App installation.',
    );
  }

  if (getEnvironment().mockMode) {
    const existing = mockPublications().get(input.idempotencyKey);
    if (existing !== undefined) return existing;
    const commitSha = createHash('sha256')
      .update(
        `${prepared.source.sourceSha256}:${repository.id}:${input.branch}:${input.idempotencyKey}`,
      )
      .digest('hex')
      .slice(0, 40);
    const result = WebsiteGithubPublicationSchema.parse({
      branch: input.branch,
      commitSha,
      commitUrl: `https://github.com/${repository.fullName}/commit/${commitSha}`,
      repositoryFullName: repository.fullName,
      sourceSha256: prepared.source.sourceSha256,
      version: input.version,
    });
    mockPublications().set(input.idempotencyKey, result);
    return result;
  }

  const admin = createSupabaseAdminClient();
  const existing = await admin
    .from('website_github_publications')
    .select('status, spec_version, repository_full_name, branch, source_sha256, commit_sha')
    .eq('tenant_id', context.actor.tenantId)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (existing.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The GitHub publishing request could not be checked.',
    );
  }
  if (existing.data !== null) {
    const row = ExistingPublicationSchema.parse(existing.data);
    if (row.status === 'succeeded' && row.commit_sha !== null) {
      return publicationView({
        ...row,
        commit_sha: row.commit_sha,
        status: 'succeeded',
      });
    }
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      row.status === 'pending'
        ? 'This GitHub publishing request is already running.'
        : 'Create a new publishing request before retrying a failed push.',
    );
  }

  const pending = await admin
    .from('website_github_publications')
    .insert({
      branch: input.branch,
      connection_id: connection.id,
      idempotency_key: input.idempotencyKey,
      project_id: projectId,
      repository_full_name: repository.fullName,
      repository_id: Number(repository.id),
      source_sha256: prepared.source.sourceSha256,
      spec_version: input.version,
      started_by: context.actor.userId,
      tenant_id: context.actor.tenantId,
    })
    .select('id')
    .single();
  if (pending.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The GitHub publishing request could not be created.',
    );
  }
  const publicationId = z.string().uuid().parse(pending.data.id);
  try {
    const pushed = await pushGithubStaticSource({
      branch: input.branch,
      installationId: connection.view.installationId,
      projectId,
      repository,
      source: prepared.source,
      version: input.version,
    });
    const completedAt = new Date().toISOString();
    const completed = await admin
      .from('website_github_publications')
      .update({
        commit_sha: pushed.commitSha,
        completed_at: completedAt,
        status: 'succeeded',
        tree_sha: pushed.treeSha,
      })
      .eq('id', publicationId)
      .eq('tenant_id', context.actor.tenantId)
      .eq('status', 'pending');
    if (completed.error !== null) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The successful GitHub push could not be recorded.',
      );
    }
    await auditGithubPush(context, {
      branch: input.branch,
      commitSha: pushed.commitSha,
      projectId,
      repositoryFullName: repository.fullName,
      repositoryId: repository.id,
      sourceSha256: prepared.source.sourceSha256,
      status: 'succeeded',
      version: input.version,
    });
    return WebsiteGithubPublicationSchema.parse({
      branch: input.branch,
      commitSha: pushed.commitSha,
      commitUrl: pushed.commitUrl,
      repositoryFullName: repository.fullName,
      sourceSha256: prepared.source.sourceSha256,
      version: input.version,
    });
  } catch (error) {
    const errorCode = error instanceof GithubAppError ? error.code : 'GITHUB_PUBLISH_FAILED';
    await admin
      .from('website_github_publications')
      .update({
        completed_at: new Date().toISOString(),
        error_code: errorCode,
        status: 'failed',
      })
      .eq('id', publicationId)
      .eq('tenant_id', context.actor.tenantId)
      .eq('status', 'pending');
    await auditGithubPush(context, {
      branch: input.branch,
      errorCode,
      projectId,
      repositoryFullName: repository.fullName,
      repositoryId: repository.id,
      sourceSha256: prepared.source.sourceSha256,
      status: 'failed',
      version: input.version,
    });
    throw new WebsiteStudioError(
      'WEBSITE_PROVIDER_UNAVAILABLE',
      'GitHub could not publish this exact website version. No other branch was changed.',
      { cause: error },
    );
  }
}
