import { MAX_ATTACHMENT_BYTES } from '@ai-workflow-studio/tool-registry';

import { assistantApiError, readAssistantJson } from '@/lib/assistant-api';
import { AssistantAttachmentUploadRequestSchema } from '@/lib/assistant-resource-schema';
import { uploadAssistantAttachment } from '@/lib/assistant-resource-server';
import { requireWorkspaceContext } from '@/lib/auth/context';

const MAX_UPLOAD_REQUEST_BYTES = MAX_ATTACHMENT_BYTES * 2 + 65_536;

export async function POST(request: Request): Promise<Response> {
  try {
    const input = AssistantAttachmentUploadRequestSchema.parse(
      await readAssistantJson(request, MAX_UPLOAD_REQUEST_BYTES),
    );
    const context = await requireWorkspaceContext();
    return Response.json(
      { attachment: await uploadAssistantAttachment(context, input) },
      { headers: { 'cache-control': 'no-store' }, status: 201 },
    );
  } catch (error) {
    return assistantApiError(error);
  }
}

export const runtime = 'nodejs';
