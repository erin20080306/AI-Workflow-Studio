import { createGooglePkcePair } from '@ai-workflow-studio/google-sheets';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

import { googleApiError } from '@/lib/google-api';
import { googleConnectionService, googleOAuthClient } from '@/lib/google-connections';
import {
  assertGoogleConnectionUpgradeStartRole,
  createGoogleOAuthState,
  createGoogleReauthorizationBinding,
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_COOKIES,
  GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS,
  parseGoogleReauthorizationTarget,
} from '@/lib/google-oauth-reauthorization';
import { getWebActor } from '@/lib/agent-server';

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await getWebActor();
    const reauthorizationTarget = parseGoogleReauthorizationTarget(request.url);
    if (reauthorizationTarget !== undefined) {
      assertGoogleConnectionUpgradeStartRole(actor.role);
      await googleConnectionService().assertUpgradeTarget(actor, reauthorizationTarget);
    }
    const state = createGoogleOAuthState(
      randomBytes(32).toString('base64url'),
      reauthorizationTarget !== undefined,
    );
    const pkce = createGooglePkcePair();
    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: true,
      maxAge: GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS,
      path: GOOGLE_OAUTH_CALLBACK_PATH,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    };
    cookieStore.delete({
      name: GOOGLE_OAUTH_COOKIES.reauthorization,
      path: GOOGLE_OAUTH_CALLBACK_PATH,
    });
    cookieStore.set(GOOGLE_OAUTH_COOKIES.state, state, cookieOptions);
    cookieStore.set(GOOGLE_OAUTH_COOKIES.verifier, pkce.verifier, cookieOptions);
    if (reauthorizationTarget !== undefined) {
      cookieStore.set(
        GOOGLE_OAUTH_COOKIES.reauthorization,
        createGoogleReauthorizationBinding(state, reauthorizationTarget),
        cookieOptions,
      );
    }
    return Response.redirect(googleOAuthClient().authorizationUrl(state, pkce.challenge), 302);
  } catch (error) {
    return googleApiError(error);
  }
}

export const runtime = 'nodejs';
