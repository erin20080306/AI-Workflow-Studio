import { z } from 'zod';

import { googleApiError } from '@/lib/google-api';
import { listGoogleSheets } from '@/lib/google-connections';

const ParamsSchema = z
  .object({
    connectionId: z.string().uuid(),
    spreadsheetId: z
      .string()
      .min(10)
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export async function GET(
  request: Request,
  context: {
    params: Promise<{ connectionId: string; spreadsheetId: string }>;
  },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await context.params);
    return Response.json(
      {
        sheets: await listGoogleSheets(params.connectionId, params.spreadsheetId, request.signal),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return googleApiError(error);
  }
}

export const runtime = 'nodejs';
