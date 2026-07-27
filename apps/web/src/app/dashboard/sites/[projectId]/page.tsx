import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WebsiteBriefWorkspace } from '@/components/sites/website-brief-workspace';
import { listAiModelMappings } from '@/lib/ai-model-routing';
import { buildAiTierOptions } from '@/lib/ai-model-selection';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { buildWebsiteGenerationModelOptions } from '@/lib/website-generation-models';
import { getWebsiteSpecGeneration, websiteSpecClientView } from '@/lib/website-spec-server';
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
    const generation = await getWebsiteSpecGeneration(context, project.id);
    const mappings = await listAiModelMappings();
    return (
      <WebsiteBriefWorkspace
        initialGeneration={generation === undefined ? undefined : websiteSpecClientView(generation)}
        initialProject={project}
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
