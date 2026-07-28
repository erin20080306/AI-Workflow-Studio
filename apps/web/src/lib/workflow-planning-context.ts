import type { ExecutionTarget } from '@ai-workflow-studio/workflow-schema';

import type { AssistantExecutionTarget } from '@/lib/assistant-execution-targets';

export interface WorkflowPlanningContext {
  readonly allowedFolderAliasIds: readonly string[];
  readonly executionTarget: ExecutionTarget;
  readonly selectedTarget?: AssistantExecutionTarget;
}

export function selectWorkflowPlanningContext(
  targets: readonly AssistantExecutionTarget[],
): WorkflowPlanningContext {
  const selectedTarget = targets.find((target) => target.status === 'online') ?? targets.at(0);
  if (selectedTarget === undefined) {
    return {
      allowedFolderAliasIds: [],
      executionTarget: { type: 'cloud' },
    };
  }
  return {
    allowedFolderAliasIds: selectedTarget.folderAliases.map((folder) => folder.id),
    executionTarget: {
      deviceId: selectedTarget.deviceId,
      type: 'desktop',
    },
    selectedTarget,
  };
}
