import {
  GOOGLE_APPS_SCRIPT_DEPLOYMENT_SCOPES,
  type GoogleConnectionService,
  type GoogleWorkspaceClient,
  type SafeAppsScriptTemplate,
} from '@ai-workflow-studio/google-sheets';

export async function deployApprovedAppsScriptForConnection(
  connectionService: Pick<GoogleConnectionService, 'accessToken' | 'assertScopes'>,
  workspace: Pick<GoogleWorkspaceClient, 'deploySafeAppsScript'>,
  input: {
    readonly connectionId: string;
    readonly deployment: 'api_executable';
    readonly normalizeGoogleError: (error: unknown) => unknown;
    readonly onAuthorized?: () => Promise<void>;
    readonly parentId?: string;
    readonly signal?: AbortSignal;
    readonly template: SafeAppsScriptTemplate;
    readonly tenantId: string;
    readonly title: string;
  },
) {
  try {
    await connectionService.assertScopes(
      input.tenantId,
      input.connectionId,
      GOOGLE_APPS_SCRIPT_DEPLOYMENT_SCOPES,
    );
  } catch (error) {
    throw input.normalizeGoogleError(error);
  }
  await input.onAuthorized?.();
  try {
    const accessToken = await connectionService.accessToken(
      input.tenantId,
      input.connectionId,
      input.signal,
    );
    await connectionService.assertScopes(
      input.tenantId,
      input.connectionId,
      GOOGLE_APPS_SCRIPT_DEPLOYMENT_SCOPES,
    );
    return await workspace.deploySafeAppsScript(
      accessToken,
      {
        deployment: input.deployment,
        ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
        template: input.template,
        title: input.title,
      },
      input.signal,
    );
  } catch (error) {
    throw input.normalizeGoogleError(error);
  }
}
