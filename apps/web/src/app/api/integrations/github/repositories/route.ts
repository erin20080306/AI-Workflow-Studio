import { requireWorkspaceContext } from '@/lib/auth/context';
import { listWebsiteGithubRepositories } from '@/lib/website-github-server';
import { websiteApiError } from '@/lib/website-studio-api';

export async function GET(): Promise<Response> {
  try {
    const context = await requireWorkspaceContext();
    return Response.json(
      { repositories: await listWebsiteGithubRepositories(context) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
