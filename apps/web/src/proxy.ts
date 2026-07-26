import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import {
  hasSupabasePublicConfiguration,
  parseSupabasePublicConfiguration,
} from './lib/supabase/config';

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (
    process.env.NEXT_PUBLIC_MOCK_MODE !== 'false' ||
    !hasSupabasePublicConfiguration(process.env)
  ) {
    return NextResponse.next({ request });
  }

  const configuration = parseSupabasePublicConfiguration(process.env);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(configuration.url, configuration.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, options, value }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
