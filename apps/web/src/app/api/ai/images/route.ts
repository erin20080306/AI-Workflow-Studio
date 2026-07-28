import {
  appendAssistantMessage,
  ensureAssistantConversation,
} from '@/lib/assistant-conversation-server';
import {
  hashAssistantImagePrompt,
  removeAssistantImage,
  storeAssistantImage,
} from '@/lib/assistant-image-server';
import { AssistantImageGenerationRequestSchema } from '@/lib/assistant-image-schema';
import { assistantApiError, readAssistantJson } from '@/lib/assistant-api';
import { requireWorkspaceContext } from '@/lib/auth/context';
import {
  assertWebsiteImageRequestCost,
  resolveWebsiteImageRoute,
} from '@/lib/website-image-routing';
import { generateWebsiteImage } from '@/lib/website-image-provider';
import { WebsiteStudioError } from '@/lib/website-studio-server';
import { websiteApiError } from '@/lib/website-studio-api';
import {
  recordReservedWebsiteImageUsage,
  reserveWebsiteImageUsage,
  type AssistantUsageReservation,
} from '@/lib/usage-control-server';

export async function POST(request: Request): Promise<Response> {
  let reservation: AssistantUsageReservation | undefined;
  try {
    const input = AssistantImageGenerationRequestSchema.parse(
      await readAssistantJson(request, 24_000),
    );
    const context = await requireWorkspaceContext();
    const imageProvider =
      input.provider === 'gemini' || input.provider === 'openai' ? input.provider : 'auto';
    const route = await resolveWebsiteImageRoute(context, {
      provider: imageProvider,
      tier: input.tier,
    });
    assertWebsiteImageRequestCost(route);

    const conversation = await ensureAssistantConversation(context, {
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
      mode: 'image',
      model: route.model,
      provider: route.provider,
      title: input.prompt,
    });
    const userMessage = await appendAssistantMessage(context, {
      body: input.prompt,
      conversationId: conversation.id,
      role: 'user',
    });

    reservation = await reserveWebsiteImageUsage(context, {
      maximumCostMicrounits: route.maximumCostMicrounits,
      provider: route.provider,
    });
    const image = await generateWebsiteImage(route, input.prompt, {
      signal: request.signal,
    });
    const stored = await storeAssistantImage(context, {
      alt: input.prompt,
      conversationId: conversation.id,
      image,
      promptHash: hashAssistantImagePrompt(input.prompt),
    });
    try {
      await recordReservedWebsiteImageUsage(context, reservation, {
        assetId: stored.id,
        byteSize: stored.byteSize,
        height: stored.height,
        model: stored.model,
        provider: stored.provider,
        width: stored.width,
      });
      const assistantMessage = await appendAssistantMessage(context, {
        body: input.locale === 'en' ? 'Image generated.' : '圖片已產生。',
        conversationId: conversation.id,
        image: stored,
        model: route.model,
        provider: route.provider,
        role: 'assistant',
      });
      return Response.json(
        {
          assistantMessage,
          conversationId: conversation.id,
          image: stored,
          userMessage,
        },
        { headers: { 'cache-control': 'no-store' }, status: 201 },
      );
    } catch (error) {
      await removeAssistantImage(context, stored.id);
      throw error;
    }
  } catch (error) {
    if (error instanceof WebsiteStudioError) {
      return websiteApiError(error);
    }
    return assistantApiError(error);
  } finally {
    try {
      await reservation?.release();
    } catch {
      // Reservations expire automatically; never mask the image outcome.
    }
  }
}

export const runtime = 'nodejs';
