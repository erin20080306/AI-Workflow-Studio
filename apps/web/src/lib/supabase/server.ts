import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { parseSupabasePublicConfiguration } from './config';

const ServiceConfigurationSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(24),
});

export async function createSupabaseServerClient() {
  const configuration = parseSupabasePublicConfiguration(process.env);
  const cookieStore = await cookies();

  return createServerClient(configuration.url, configuration.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, options, value }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. The request Proxy refreshes
          // sessions before protected rendering; Server Actions and routes can write.
        }
      },
    },
  });
}

export function createSupabaseAdminClient() {
  const publicConfiguration = parseSupabasePublicConfiguration(process.env);
  const serviceConfiguration = ServiceConfigurationSchema.safeParse(process.env);
  if (!serviceConfiguration.success) {
    throw new Error('Supabase administrator access is not configured.');
  }

  return createClient(
    publicConfiguration.url,
    serviceConfiguration.data.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
