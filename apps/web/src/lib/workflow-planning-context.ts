import type { ExecutionTarget } from '@ai-workflow-studio/workflow-schema';

import type { AssistantExecutionTarget } from '@/lib/assistant-execution-targets';

export interface WorkflowPlanningContext {
  readonly allowedFolderAliasIds: readonly string[];
  readonly executionTarget: ExecutionTarget;
  readonly selectedTarget?: AssistantExecutionTarget;
}

export function selectTrustedFolderAliasIds(
  serverAllowedFolderAliasIds: readonly string[],
  requestedFolderAliasIds: readonly string[],
): readonly string[] {
  const requested = new Set(requestedFolderAliasIds);
  return serverAllowedFolderAliasIds.filter((folderAliasId) => requested.has(folderAliasId));
}

const DOWNLOAD_FOLDER_INTENT = /downloads?|下載區|下载区|下載項目|下载项目|下載資料夾|下载文件夹/iu;
const DOWNLOAD_FOLDER_NAME = /downloads?|下載項目|下载项目/iu;
const TEMPORARY_FOLDER_NAME = /(?:^|[\s_-])(?:temp|tmp)(?:$|[\s_-])|測試|测试|暫存|临时/iu;

export function selectAutomaticFolderAliasId(
  target: AssistantExecutionTarget | undefined,
  prompt: string,
): string | undefined {
  if (target === undefined) return undefined;
  const writableFolders = target.folderAliases.filter(
    (folder) => folder.permissions.read && folder.permissions.write,
  );
  if (DOWNLOAD_FOLDER_INTENT.test(prompt)) {
    const downloadFolder = writableFolders.find((folder) =>
      DOWNLOAD_FOLDER_NAME.test(folder.displayName),
    );
    return downloadFolder?.id;
  }
  if (writableFolders.length === 1) return writableFolders[0]?.id;
  const durableFolders = writableFolders.filter(
    (folder) => !TEMPORARY_FOLDER_NAME.test(folder.displayName),
  );
  return durableFolders.length === 1 ? durableFolders[0]?.id : undefined;
}

export function selectWorkflowPlanningContext(
  targets: readonly AssistantExecutionTarget[],
  requestedTarget?: ExecutionTarget,
): WorkflowPlanningContext {
  const requestedDeviceId =
    requestedTarget?.type === 'desktop' ? requestedTarget.deviceId : undefined;
  const selectedTarget =
    targets.find((target) => target.deviceId === requestedDeviceId && target.status === 'online') ??
    targets.find((target) => target.status === 'online') ??
    targets.at(0);
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
