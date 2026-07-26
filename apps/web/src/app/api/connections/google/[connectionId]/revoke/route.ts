import { z } from 'zod';

import { googleApiError } from '@/lib/google-api';
import { revokeGoogleConnection } from '@/lib/google-connections';

const ConnectionIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ connectionId: string }> },
): Promise<Response> {
  try {
    const connectionId = ConnectionIdSchema.parse((await context.params).connectionId);
    await revokeGoogleConnection(connectionId, request.signal);
    return Response.json({ revoked: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return googleApiError(error);
  }
}

export const runtime = 'nodejs';
