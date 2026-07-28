import { WebsiteBriefAnswerInputSchema } from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { readWebsiteJson, websiteApiError } from '@/lib/website-studio-api';
import { answerWebsiteBriefQuestion, listWebsiteBriefMessages } from '@/lib/website-prompt-server';

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();
const AnswerRouteInputSchema = WebsiteBriefAnswerInputSchema.extend({
  locale: z.enum(['en', 'zh-Hant']),
}).strict();

export async function GET(
  _request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    return Response.json(
      { messages: await listWebsiteBriefMessages(context, params.projectId) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export async function POST(
  request: Request,
  routeContext: { readonly params: Promise<{ readonly projectId: string }> },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    const input = AnswerRouteInputSchema.parse(await readWebsiteJson(request));
    return Response.json(
      await answerWebsiteBriefQuestion(
        context,
        params.projectId,
        { answer: input.answer, step: input.step },
        input.locale,
      ),
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
