import { z } from 'zod';

const SupabasePublicConfigurationSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  })
  .passthrough()
  .transform((input) => ({
    key: input.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? input.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    url: input.NEXT_PUBLIC_SUPABASE_URL,
  }))
  .refine((input) => input.key !== undefined, {
    message: 'A Supabase publishable or anonymous key is required.',
  });

export interface SupabasePublicConfiguration {
  readonly key: string;
  readonly url: string;
}

export function parseSupabasePublicConfiguration(
  input: Record<string, string | undefined>,
): SupabasePublicConfiguration {
  const parsed = SupabasePublicConfigurationSchema.safeParse(input);
  if (!parsed.success || parsed.data.key === undefined) {
    throw new Error('Supabase public configuration is incomplete.');
  }
  return {
    key: parsed.data.key,
    url: parsed.data.url,
  };
}

export function hasSupabasePublicConfiguration(input: Record<string, string | undefined>): boolean {
  return SupabasePublicConfigurationSchema.safeParse(input).success;
}
