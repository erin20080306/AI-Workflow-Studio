import type { EmailOtpType } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ensureTenantFromSignupMetadata } from '@/lib/auth/onboarding';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const OtpTypeSchema = z.enum([
  'email',
  'email_change',
  'invite',
  'magiclink',
  'recovery',
  'signup',
]);

const safeDestinations = new Set(['/dashboard', '/onboarding', '/update-password']);

function safeNext(value: string | null): string {
  return value !== null && safeDestinations.has(value) ? value : '/dashboard';
}

function redirectWithoutSecrets(request: NextRequest, pathname: string, status?: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  if (status !== undefined) {
    url.searchParams.set('status', status);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = OtpTypeSchema.safeParse(request.nextUrl.searchParams.get('type'));
  const code = request.nextUrl.searchParams.get('code');
  const destination = safeNext(request.nextUrl.searchParams.get('next'));
  const supabase = await createSupabaseServerClient();

  let verified = false;
  if (tokenHash !== null && type.success) {
    const result = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type.data as EmailOtpType,
    });
    verified = result.error === null;
  } else if (code !== null && code.length >= 8 && code.length <= 4_000) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    verified = result.error === null;
  }

  if (!verified) {
    return redirectWithoutSecrets(request, '/login', 'confirmation-failed');
  }

  if (type.success && type.data === 'recovery') {
    return redirectWithoutSecrets(request, '/update-password');
  }

  const userResult = await supabase.auth.getUser();
  if (userResult.error !== null || userResult.data.user === null) {
    return redirectWithoutSecrets(request, '/login', 'confirmation-failed');
  }

  const tenantId = await ensureTenantFromSignupMetadata(
    supabase,
    userResult.data.user.id,
    userResult.data.user.user_metadata,
  );
  return redirectWithoutSecrets(request, tenantId === null ? '/onboarding' : destination);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
