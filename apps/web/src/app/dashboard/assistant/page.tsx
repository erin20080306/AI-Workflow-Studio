import type { Metadata } from 'next';

import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';
import { buildAssistantModelOptions } from '@/lib/assistant-models';
import { getEnvironment } from '@/lib/env';

export const metadata: Metadata = {
  title: 'AI 工作台',
};

export default function AssistantPage() {
  const environment = getEnvironment();

  return (
    <AssistantWorkspace
      mockMode={environment.mockMode}
      models={buildAssistantModelOptions(environment)}
    />
  );
}
