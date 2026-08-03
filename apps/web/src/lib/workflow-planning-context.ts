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

const DOWNLOAD_FOLDER_INTENT =
  /downloads?|下載|下载|可見\s*codex|開啟\s*(?:google\s*)?chrome|下載區|下载区|下載項目|下载项目|下載資料夾|下载文件夹/iu;
const DOWNLOAD_FOLDER_NAME = /downloads?|下載項目|下载项目/iu;
const TEMPORARY_FOLDER_NAME = /(?:^|[\s_-])(?:temp|tmp)(?:$|[\s_-])|測試|测试|暫存|临时/iu;

export function isReadyAssistantExecutionTarget(target: AssistantExecutionTarget): boolean {
  return target.status === 'online' && target.agentCompatible;
}

export function selectAutomaticFolderAliasId(
  target: AssistantExecutionTarget | undefined,
  prompt: string,
): string | undefined {
  if (target === undefined) return undefined;
  const writableFolders = target.folderAliases.filter(
    (folder) => folder.permissions.read && folder.permissions.write,
  );
  if (DOWNLOAD_FOLDER_INTENT.test(prompt)) {
    const downloadFolders = writableFolders.filter((folder) =>
      DOWNLOAD_FOLDER_NAME.test(folder.displayName),
    );
    return downloadFolders.length === 1 ? downloadFolders[0]?.id : undefined;
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
  if (requestedTarget?.type === 'cloud') {
    return {
      allowedFolderAliasIds: [],
      executionTarget: { type: 'cloud' },
    };
  }
  const requestedDeviceId =
    requestedTarget?.type === 'desktop' ? requestedTarget.deviceId : undefined;
  const selectedTarget =
    requestedDeviceId === undefined
      ? targets.find(isReadyAssistantExecutionTarget)
      : targets.find(
          (target) =>
            target.deviceId === requestedDeviceId && isReadyAssistantExecutionTarget(target),
        );
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

export function selectPreferredAssistantDeviceId(
  targets: readonly AssistantExecutionTarget[],
  currentDeviceId?: string,
): string {
  const currentTarget = targets.find(
    (target) => target.deviceId === currentDeviceId && isReadyAssistantExecutionTarget(target),
  );
  return currentTarget?.deviceId ?? targets.find(isReadyAssistantExecutionTarget)?.deviceId ?? '';
}
