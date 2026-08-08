import type { GoogleConnectionView } from '@ai-workflow-studio/google-sheets';

export function selectPlanningGoogleConnections(
  connections: readonly GoogleConnectionView[],
  needsAppsScript: boolean,
): {
  readonly connectionIds: readonly string[];
  readonly requiresReauthorization: boolean;
} {
  const active = connections.filter((connection) => connection.status === 'active');
  return {
    connectionIds: active
      .filter((connection) => !needsAppsScript || !connection.requiresReauthorization)
      .map((connection) => connection.id),
    requiresReauthorization:
      needsAppsScript && active.some((connection) => connection.requiresReauthorization),
  };
}
