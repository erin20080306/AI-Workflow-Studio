import { WebsiteProjectCreateInputSchema } from '@ai-workflow-studio/website-schema';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { readWebsiteJson, websiteApiError } from '@/lib/website-studio-api';
import { createWebsiteProject, listWebsiteProjects } from '@/lib/website-studio-server';

export async function GET(): Promise<Response> {
  try {
    const context = await requireWorkspaceContext();
    return Response.json(
      { projects: await listWebsiteProjects(context) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireWorkspaceContext();
    const input = WebsiteProjectCreateInputSchema.parse(await readWebsiteJson(request));
    return Response.json(
      { project: await createWebsiteProject(context, input) },
      {
        headers: { 'cache-control': 'no-store' },
        status: 201,
      },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
