import type { Metadata } from 'next';

import { WebsiteStudioHome } from '@/components/sites/website-studio-home';
import { listAiModelMappings } from '@/lib/ai-model-routing';
import { buildAiTierOptions } from '@/lib/ai-model-selection';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { buildWebsiteGenerationModelOptions } from '@/lib/website-generation-models';
import { listWebsiteProjects } from '@/lib/website-studio-server';

export const metadata: Metadata = {
  title: '網站工作室',
};

export default async function WebsiteStudioPage() {
  const context = await requireWorkspaceContext();
  const [projects, mappings] = await Promise.all([
    listWebsiteProjects(context),
    listAiModelMappings(),
  ]);
  return (
    <WebsiteStudioHome
      initialProjects={projects}
      modelOptions={buildWebsiteGenerationModelOptions(getEnvironment())}
      tierOptions={buildAiTierOptions(context.subscription.plan, mappings)}
    />
  );
}

export const dynamic = 'force-dynamic';
