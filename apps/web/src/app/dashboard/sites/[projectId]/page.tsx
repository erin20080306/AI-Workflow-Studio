import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WebsiteBriefWorkspace } from '@/components/sites/website-brief-workspace';
import { listAccountAvailableAiModelMappings } from '@/lib/ai-model-routing';
import { buildAiTierOptions } from '@/lib/ai-model-selection';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { buildWebsiteGenerationModelOptions } from '@/lib/website-generation-models';
import { listWebsiteBriefMessages } from '@/lib/website-prompt-server';
import { getActiveWebsitePublication } from '@/lib/website-publication-server';
import {
  getWebsiteSpecGeneration,
  listWebsiteSpecGenerations,
  websiteSpecClientView,
} from '@/lib/website-spec-server';
import { canDownloadWebsiteExport } from '@/lib/website-static-export-access';
import { getWebsiteProject, WebsiteStudioError } from '@/lib/website-studio-server';

export const metadata: Metadata = {
  title: '網站需求引導',
};

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();

export default async function WebsiteBriefPage({
  params,
}: Readonly<{
  params: Promise<{ projectId: string }>;
}>) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const context = await requireWorkspaceContext();
  try {
    const project = await getWebsiteProject(context, parsed.data.projectId);
    const [generation, versions, mappings, messages, publication] = await Promise.all([
      getWebsiteSpecGeneration(context, project.id),
      listWebsiteSpecGenerations(context, project.id),
      listAccountAvailableAiModelMappings(),
      listWebsiteBriefMessages(context, project.id),
      getActiveWebsitePublication(context, project.id),
    ]);
    return (
      <WebsiteBriefWorkspace
        canExportWebsite={canDownloadWebsiteExport(context)}
        initialGeneration={generation === undefined ? undefined : websiteSpecClientView(generation)}
        initialMessages={messages}
        initialPublication={publication}
        initialProject={project}
        initialVersions={versions.map(websiteSpecClientView)}
        modelOptions={buildWebsiteGenerationModelOptions(getEnvironment())}
        tierOptions={buildAiTierOptions(context.subscription.plan, mappings)}
      />
    );
  } catch (error) {
    if (error instanceof WebsiteStudioError && error.code === 'WEBSITE_NOT_FOUND') {
      notFound();
    }
    throw error;
  }
}

export const dynamic = 'force-dynamic';
