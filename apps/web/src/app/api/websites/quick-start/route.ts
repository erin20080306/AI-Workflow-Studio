import { WebsitePromptStartInputSchema } from '@ai-workflow-studio/website-schema';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { readWebsiteJson, websiteApiError } from '@/lib/website-studio-api';
import { startWebsiteFromPrompt } from '@/lib/website-prompt-server';

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireWorkspaceContext();
    const input = WebsitePromptStartInputSchema.parse(await readWebsiteJson(request));
    return Response.json(await startWebsiteFromPrompt(context, input, request.signal), {
      headers: { 'cache-control': 'no-store' },
      status: 201,
    });
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
