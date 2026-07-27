import type { Metadata } from 'next';

import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';
import { listAiModelMappings } from '@/lib/ai-model-routing';
import { buildAiTierOptions } from '@/lib/ai-model-selection';
import { buildAssistantModelOptions } from '@/lib/assistant-models';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';

export const metadata: Metadata = {
  title: 'AI 工作台',
};

export default async function AssistantPage() {
  const environment = getEnvironment();
  const context = await requireWorkspaceContext();
  const mappings = await listAiModelMappings();

  return (
    <AssistantWorkspace
      mockMode={environment.mockMode}
      models={buildAssistantModelOptions(environment)}
      tiers={buildAiTierOptions(context.subscription.plan, mappings)}
    />
  );
}
