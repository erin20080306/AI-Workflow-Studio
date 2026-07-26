import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { createGoogleConnectionFromCode } from '@/lib/google-connections';

const CallbackSchema = z
  .object({
    code: z.string().min(8).max(4_000),
    state: z.string().regex(/^[A-Za-z0-9_-]{32,200}$/),
  })
  .strict();
const CALLBACK_PATH = '/api/connections/google/callback';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function settingsRedirect(request: Request, status: 'connected' | 'error'): Response {
  const url = new URL('/dashboard/settings/connections', request.url);
  url.searchParams.set('google', status);
  return Response.redirect(url, 303);
}

export async function GET(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const storedState = cookieStore.get('aiws_google_oauth_state')?.value;
  const verifier = cookieStore.get('aiws_google_oauth_verifier')?.value;
  cookieStore.delete({ name: 'aiws_google_oauth_state', path: CALLBACK_PATH });
  cookieStore.delete({ name: 'aiws_google_oauth_verifier', path: CALLBACK_PATH });

  const url = new URL(request.url);
  const parsed = CallbackSchema.safeParse({
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
  });
  if (
    !parsed.success ||
    storedState === undefined ||
    verifier === undefined ||
    !safeEqual(parsed.data.state, storedState)
  ) {
    return settingsRedirect(request, 'error');
  }
  try {
    await createGoogleConnectionFromCode(parsed.data.code, verifier, request.signal);
    return settingsRedirect(request, 'connected');
  } catch {
    return settingsRedirect(request, 'error');
  }
}

export const runtime = 'nodejs';
