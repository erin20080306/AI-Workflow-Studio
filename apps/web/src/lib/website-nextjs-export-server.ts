import 'server-only';

import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { getPublishedWebsiteAsset } from '@/lib/website-asset-server';
import { createWebsiteNextAppExport, type WebsiteNextExport } from '@/lib/website-nextjs-export';
import { getWebsiteSpecVersion } from '@/lib/website-spec-server';
import { canDownloadWebsiteExport } from '@/lib/website-static-export-access';
import { getWebsiteProject, WebsiteStudioError } from '@/lib/website-studio-server';

export async function exportWebsiteNextApp(
  context: WorkspaceContext,
  projectId: string,
  version: number,
): Promise<WebsiteNextExport> {
  if (!canDownloadWebsiteExport(context)) {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'Deployable store downloads require an active paid subscription.',
    );
  }
  const project = await getWebsiteProject(context, projectId);
  const generation = await getWebsiteSpecVersion(context, project.id, version);
  if (generation === undefined) {
    throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The website version was not found.');
  }
  const hasStorefront = generation.spec.pages.some((page) =>
    page.sections.some((section) => section.type === 'product-grid'),
  );
  if (!hasStorefront) {
    throw new WebsiteStudioError(
      'WEBSITE_INVALID',
      'This website has no storefront to export as a deployable app.',
    );
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
  let result: WebsiteNextExport;
  try {
    result = createWebsiteNextAppExport({
      assets,
      generation,
      project: { id: project.id, name: project.name, slug: project.slug },
    });
  } catch (error) {
    if (error instanceof WebsiteStudioError) throw error;
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The deployable store archive could not be created.',
      { cause: error },
    );
  }
  if (!getEnvironment().mockMode) {
    const audit = await createSupabaseAdminClient()
      .from('audit_logs')
      .insert({
        action: 'website.export.next_app_downloaded',
        actor_user_id: context.actor.userId,
        correlation_id: projectId,
        metadata: {
          archiveSha256: result.archiveSha256,
          archiveSize: result.bytes.byteLength,
          fileCount: result.fileCount,
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
  return result;
}
