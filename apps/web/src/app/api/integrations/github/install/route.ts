import { cookies } from 'next/headers';
import { z } from 'zod';

import {
  createGithubOauthSecrets,
  getGithubAppConfiguration,
  githubAppInstallationUrl,
} from '@/lib/github-app-client';
import {
  GITHUB_OAUTH_COOKIES,
  GITHUB_OAUTH_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/github-oauth-cookies';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getWebsiteGithubState } from '@/lib/website-github-server';
import { websiteApiError } from '@/lib/website-studio-api';
import { getWebsiteProject } from '@/lib/website-studio-server';

const QuerySchema = z.object({ projectId: z.string().uuid() }).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    const query = QuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const context = await requireWorkspaceContext();
    await getWebsiteProject(context, query.projectId);
    const state = await getWebsiteGithubState(context);
    if (!state.configured) getGithubAppConfiguration();
    const configuration = getGithubAppConfiguration();
    const secrets = createGithubOauthSecrets();
    const cookieStore = await cookies();
    const options = {
      httpOnly: true,
      maxAge: GITHUB_OAUTH_COOKIE_MAX_AGE_SECONDS,
      path: '/api/integrations/github',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    } as const;
    cookieStore.set(GITHUB_OAUTH_COOKIES.project, query.projectId, options);
    cookieStore.set(GITHUB_OAUTH_COOKIES.state, secrets.state, options);
    cookieStore.set(GITHUB_OAUTH_COOKIES.verifier, secrets.verifier, options);
    return Response.redirect(githubAppInstallationUrl(configuration.appSlug, secrets.state), 303);
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
