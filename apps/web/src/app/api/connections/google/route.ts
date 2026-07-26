import { googleApiError } from '@/lib/google-api';
import { listGoogleConnections } from '@/lib/google-connections';

export async function GET(): Promise<Response> {
  try {
    return Response.json(
      { connections: await listGoogleConnections() },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return googleApiError(error);
  }
}

export const runtime = 'nodejs';
