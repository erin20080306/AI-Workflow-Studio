import 'server-only';

import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { getPublishedWebsiteAsset } from '@/lib/website-asset-server';
import { getWebsiteSpecVersion } from '@/lib/website-spec-server';
import { canDownloadWebsiteExport } from '@/lib/website-static-export-access';
import {
  createWebsiteStaticExport,
  createWebsiteStaticSource,
  type WebsiteStaticExport,
  type WebsiteStaticSource,
} from '@/lib/website-static-export';
import { getWebsiteProject, WebsiteStudioError } from '@/lib/website-studio-server';

export interface PreparedWebsiteStaticSource {
  readonly generation: NonNullable<Awaited<ReturnType<typeof getWebsiteSpecVersion>>>;
  readonly project: Awaited<ReturnType<typeof getWebsiteProject>>;
  readonly source: WebsiteStaticSource;
}

async function recordWebsiteExportAudit(
  context: WorkspaceContext,
  projectId: string,
  version: number,
  result: WebsiteStaticExport,
): Promise<void> {
  if (getEnvironment().mockMode) return;
  const audit = await createSupabaseAdminClient()
    .from('audit_logs')
    .insert({
      action: 'website.export.downloaded',
      actor_user_id: context.actor.userId,
      correlation_id: projectId,
      metadata: {
        archiveSha256: result.archiveSha256,
        archiveSize: result.bytes.byteLength,
        fileCount: result.fileCount,
        uncompressedBytes: result.uncompressedBytes,
        version,
      },
      resource_id: projectId,
      resource_type: 'website_project',
      tenant_id: context.actor.tenantId,
    });
  if (audit.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website export could not be audited.',
    );
  }
}

export async function exportWebsiteVersion(
  context: WorkspaceContext,
  projectId: string,
  version: number,
): Promise<WebsiteStaticExport> {
  if (!canDownloadWebsiteExport(context)) {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'Portable website downloads require an active paid subscription.',
    );
  }
  const prepared = await prepareWebsiteStaticSource(context, projectId, version);
  try {
    const result = createWebsiteStaticExport({
      assets: prepared.source.files
        .filter((file) => file.path.startsWith('assets/') && file.path.endsWith('.png'))
        .map((file) => ({
          bytes: file.bytes,
          id: file.path.slice('assets/'.length, -'.png'.length),
        })),
      generation: prepared.generation,
      project: {
        id: prepared.project.id,
        name: prepared.project.name,
        slug: prepared.project.slug,
      },
    });
    await recordWebsiteExportAudit(
      context,
      prepared.project.id,
      prepared.generation.version,
      result,
    );
    return result;
  } catch (error) {
    if (error instanceof WebsiteStudioError) throw error;
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The portable website archive could not be created.',
      { cause: error },
    );
  }
}

export async function prepareWebsiteStaticSource(
  context: WorkspaceContext,
  projectId: string,
  version: number,
): Promise<PreparedWebsiteStaticSource> {
  if (!canDownloadWebsiteExport(context)) {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'GitHub website publishing requires an active paid subscription.',
    );
  }
  const project = await getWebsiteProject(context, projectId);
  const generation = await getWebsiteSpecVersion(context, project.id, version);
  if (generation === undefined) {
    throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The website version was not found.');
  }
  const referencedAssets = generation.spec.assets.filter((asset) => asset.kind === 'project-asset');
  const assets = await Promise.all(
    referencedAssets.map(async (asset) => {
      const stored = await getPublishedWebsiteAsset(context.actor.tenantId, project.id, asset.id);
      if (stored === undefined) {
        throw new WebsiteStudioError(
          'WEBSITE_STATE_CONFLICT',
          `The website export asset ${asset.id} is unavailable.`,
        );
      }
      return { bytes: stored.bytes, id: asset.id };
    }),
  );
  try {
    const source = createWebsiteStaticSource({
      assets,
      generation,
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
      },
    });
    return { generation, project, source };
  } catch (error) {
    if (error instanceof WebsiteStudioError) throw error;
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The portable website source could not be created.',
      { cause: error },
    );
  }
}
