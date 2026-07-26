import { z } from 'zod';

import { googleApiError } from '@/lib/google-api';
import { checkGoogleConnection } from '@/lib/google-connections';

const ConnectionIdSchema = z.string().uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ connectionId: string }> },
): Promise<Response> {
  try {
    const connectionId = ConnectionIdSchema.parse((await context.params).connectionId);
    const result = await checkGoogleConnection(connectionId, request.signal);
    return Response.json(
      { spreadsheets: result.spreadsheets },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return googleApiError(error);
  }
}

export const runtime = 'nodejs';
