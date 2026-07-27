import type { Metadata } from 'next';

import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';
import { listAiModelMappings } from '@/lib/ai-model-routing';
import { buildAiTierOptions } from '@/lib/ai-model-selection';
import { buildAssistantModelOptions } from '@/lib/assistant-models';
import { listAssistantExecutionTargets } from '@/lib/assistant-execution-targets';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';

export const metadata: Metadata = {
  title: 'AI 工作台',
};

export default async function AssistantPage() {
  const environment = getEnvironment();
  const context = await requireWorkspaceContext();
  const [mappings, executionTargets] = await Promise.all([
    listAiModelMappings(),
    listAssistantExecutionTargets(context),
  ]);

  return (
    <AssistantWorkspace
      models={buildAssistantModelOptions(environment)}
      executionTargets={executionTargets}
      tiers={buildAiTierOptions(context.subscription.plan, mappings)}
    />
  );
}
