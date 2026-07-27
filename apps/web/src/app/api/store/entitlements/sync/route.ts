import { z } from 'zod';

import { assistantErrorDetails, readAssistantJson } from '@/lib/assistant-api';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { MicrosoftStoreError, syncMicrosoftStoreEntitlement } from '@/lib/microsoft-store-server';

const RequestSchema = z
  .object({
    storeIdKey: z.string().min(100).max(16_384),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const input = RequestSchema.parse(await readAssistantJson(request, 20_000));
    const context = await requireWorkspaceContext();
    const entitlement = await syncMicrosoftStoreEntitlement(context, input.storeIdKey);
    return Response.json(
      { entitlement },
      { headers: { 'cache-control': 'no-store' }, status: 200 },
    );
  } catch (error) {
    const safe = assistantErrorDetails(error);
    const code =
      error instanceof MicrosoftStoreError ? error.code : 'STORE_ENTITLEMENT_SYNC_FAILED';
    const status =
      error instanceof MicrosoftStoreError && error.code === 'STORE_ACCESS_DENIED'
        ? 403
        : error instanceof MicrosoftStoreError && error.code === 'STORE_ID_KEY_INVALID'
          ? 400
          : error instanceof z.ZodError
            ? 400
            : safe.code.startsWith('AUTH_')
              ? safe.status
              : 503;
    return Response.json(
      {
        error: {
          code,
          message:
            error instanceof MicrosoftStoreError
              ? error.message
              : safe.code.startsWith('AUTH_')
                ? safe.message
                : 'Microsoft Store entitlement could not be synchronized.',
        },
      },
      { headers: { 'cache-control': 'no-store' }, status },
    );
  }
}

export const runtime = 'nodejs';
