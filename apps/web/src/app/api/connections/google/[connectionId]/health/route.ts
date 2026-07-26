import { z } from 'zod';

import { googleApiError } from '@/lib/google-api';
import { checkGoogleConnection } from '@/lib/google-connections';

const ConnectionIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ connectionId: string }> },
): Promise<Response> {
  try {
    const connectionId = ConnectionIdSchema.parse((await context.params).connectionId);
    return Response.json(await checkGoogleConnection(connectionId, request.signal), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return googleApiError(error);
  }
}

export const runtime = 'nodejs';
