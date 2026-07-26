import { createGooglePkcePair } from '@ai-workflow-studio/google-sheets';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

import { googleApiError } from '@/lib/google-api';
import { googleOAuthClient } from '@/lib/google-connections';
import { getWebActor } from '@/lib/agent-server';

const CALLBACK_PATH = '/api/connections/google/callback';

export async function GET(): Promise<Response> {
  try {
    await getWebActor();
    const state = randomBytes(32).toString('base64url');
    const pkce = createGooglePkcePair();
    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: true,
      maxAge: 600,
      path: CALLBACK_PATH,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    };
    cookieStore.set('aiws_google_oauth_state', state, cookieOptions);
    cookieStore.set('aiws_google_oauth_verifier', pkce.verifier, cookieOptions);
    return Response.redirect(googleOAuthClient().authorizationUrl(state, pkce.challenge), 302);
  } catch (error) {
    return googleApiError(error);
  }
}

export const runtime = 'nodejs';
