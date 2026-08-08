import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';

import {
  createGoogleConnectionFromCode,
  createUpgradedGoogleConnectionFromCode,
} from '@/lib/google-connections';
import {
  assertGoogleConnectionUpgradeCallbackRole,
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_COOKIES,
  resolveGoogleReauthorizationTarget,
} from '@/lib/google-oauth-reauthorization';
import { getWebActor } from '@/lib/agent-server';

const CallbackSchema = z
  .object({
    code: z.string().min(8).max(4_000),
    state: z.string().regex(/^[A-Za-z0-9_-]{32,200}$/),
  })
  .strict();
function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function settingsRedirect(request: Request, status: 'connected' | 'error' | 'upgraded'): Response {
  const url = new URL('/dashboard/settings/connections', request.url);
  url.searchParams.set('google', status);
  return Response.redirect(url, 303);
}

export async function GET(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const storedState = cookieStore.get(GOOGLE_OAUTH_COOKIES.state)?.value;
  const verifier = cookieStore.get(GOOGLE_OAUTH_COOKIES.verifier)?.value;
  const reauthorizationBinding = cookieStore.get(GOOGLE_OAUTH_COOKIES.reauthorization)?.value;
  Object.values(GOOGLE_OAUTH_COOKIES).forEach((name) =>
    cookieStore.delete({ name, path: GOOGLE_OAUTH_CALLBACK_PATH }),
  );

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
    const reauthorizationTarget = resolveGoogleReauthorizationTarget(
      storedState,
      reauthorizationBinding,
    );
    if (reauthorizationTarget === undefined) {
      await createGoogleConnectionFromCode(parsed.data.code, verifier, request.signal);
    } else {
      const actor = await getWebActor();
      assertGoogleConnectionUpgradeCallbackRole(actor.role);
      await createUpgradedGoogleConnectionFromCode(
        actor,
        reauthorizationTarget,
        parsed.data.code,
        verifier,
        request.signal,
      );
    }
    return settingsRedirect(
      request,
      reauthorizationTarget === undefined ? 'connected' : 'upgraded',
    );
  } catch {
    return settingsRedirect(request, 'error');
  }
}

export const runtime = 'nodejs';
