import { requireWorkspaceContext } from '@/lib/auth/context';
import { disconnectWebsiteGithub, getWebsiteGithubState } from '@/lib/website-github-server';
import { websiteApiError } from '@/lib/website-studio-api';

export async function GET(): Promise<Response> {
  try {
    const context = await requireWorkspaceContext();
    return Response.json(await getWebsiteGithubState(context), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return websiteApiError(error);
  }
}

export async function DELETE(): Promise<Response> {
  try {
    const context = await requireWorkspaceContext();
    await disconnectWebsiteGithub(context);
    return new Response(null, {
      headers: { 'cache-control': 'no-store' },
      status: 204,
    });
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
