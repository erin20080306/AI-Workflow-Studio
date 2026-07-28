import { cookies } from 'next/headers';
import { z } from 'zod';

import {
  exchangeGithubOauthCode,
  revokeGithubUserToken,
  validateGithubInstallationForUser,
} from '@/lib/github-app-client';
import { GITHUB_OAUTH_COOKIES } from '@/lib/github-oauth-cookies';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { connectWebsiteGithubInstallation } from '@/lib/website-github-server';
import { websiteApiError } from '@/lib/website-studio-api';
import { getWebsiteProject, WebsiteStudioError } from '@/lib/website-studio-server';

const QuerySchema = z.object({
  code: z.string().min(8).max(500),
  state: z.string().min(20).max(200),
});

export async function GET(request: Request): Promise<Response> {
  let userToken: string | undefined;
  try {
    const query = QuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const context = await requireWorkspaceContext();
    const cookieStore = await cookies();
    const expectedState = cookieStore.get(GITHUB_OAUTH_COOKIES.state)?.value;
    const installationId = cookieStore.get(GITHUB_OAUTH_COOKIES.installation)?.value;
    const projectId = cookieStore.get(GITHUB_OAUTH_COOKIES.project)?.value;
    const verifier = cookieStore.get(GITHUB_OAUTH_COOKIES.verifier)?.value;
    if (
      expectedState === undefined ||
      expectedState !== query.state ||
      installationId === undefined ||
      projectId === undefined ||
      verifier === undefined
    ) {
      throw new WebsiteStudioError(
        'WEBSITE_FORBIDDEN',
        'The GitHub authorization state is invalid or expired.',
      );
    }
    await getWebsiteProject(context, z.string().uuid().parse(projectId));
    userToken = await exchangeGithubOauthCode(query.code, verifier);
    const account = await validateGithubInstallationForUser(userToken, installationId);
    await connectWebsiteGithubInstallation(context, { account, installationId });
    Object.values(GITHUB_OAUTH_COOKIES).forEach((name) => cookieStore.delete(name));
    const returnUrl = new URL(`/dashboard/sites/${projectId}`, request.url);
    returnUrl.searchParams.set('github', 'connected');
    return Response.redirect(returnUrl, 303);
  } catch (error) {
    return websiteApiError(error);
  } finally {
    if (userToken !== undefined) await revokeGithubUserToken(userToken);
  }
}

export const runtime = 'nodejs';
