import { cookies } from 'next/headers';
import { z } from 'zod';

import {
  createGithubOauthSecrets,
  getGithubAppConfiguration,
  githubOauthUrl,
} from '@/lib/github-app-client';
import {
  GITHUB_OAUTH_COOKIES,
  GITHUB_OAUTH_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/github-oauth-cookies';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { websiteApiError } from '@/lib/website-studio-api';
import { getWebsiteProject, WebsiteStudioError } from '@/lib/website-studio-server';

const QuerySchema = z
  .object({
    installation_id: z.string().regex(/^[1-9][0-9]{0,19}$/),
    setup_action: z.string().max(50).optional(),
  })
  .passthrough();

export async function GET(request: Request): Promise<Response> {
  try {
    const query = QuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const context = await requireWorkspaceContext();
    const cookieStore = await cookies();
    const projectId = cookieStore.get(GITHUB_OAUTH_COOKIES.project)?.value;
    if (projectId === undefined) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The GitHub installation request expired. Start again from Website Studio.',
      );
    }
    await getWebsiteProject(context, z.string().uuid().parse(projectId));
    const secrets = createGithubOauthSecrets();
    const options = {
      httpOnly: true,
      maxAge: GITHUB_OAUTH_COOKIE_MAX_AGE_SECONDS,
      path: '/api/integrations/github',
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    };
    cookieStore.set(GITHUB_OAUTH_COOKIES.installation, query.installation_id, options);
    cookieStore.set(GITHUB_OAUTH_COOKIES.state, secrets.state, options);
    cookieStore.set(GITHUB_OAUTH_COOKIES.verifier, secrets.verifier, options);
    return Response.redirect(
      githubOauthUrl({
        challenge: secrets.challenge,
        clientId: getGithubAppConfiguration().clientId,
        state: secrets.state,
      }),
      303,
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
