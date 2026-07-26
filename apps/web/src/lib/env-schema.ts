import { z } from 'zod';

const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalSecret = z.preprocess(emptyToUndefined, z.string().min(24).optional());
const optionalModel = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^[A-Za-z0-9._:-]{2,120}$/)
    .optional(),
);

const environmentSchema = z.object({
  AGENT_TOKEN_PEPPER: optionalSecret,
  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL: optionalModel,
  APP_ENCRYPTION_KEY: optionalSecret,
  CRON_SECRET: optionalSecret,
  GEMINI_API_KEY: optionalSecret,
  GEMINI_MODEL: optionalModel,
  GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  GOOGLE_CLIENT_SECRET: optionalSecret,
  GOOGLE_REDIRECT_URI: optionalUrl,
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_MOCK_MODE: z.enum(['true', 'false']).default('true'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: optionalModel,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
});

export interface AppEnvironment {
  readonly appUrl?: string;
  readonly googleConfigured: boolean;
  readonly mockMode: boolean;
  readonly providers: {
    readonly anthropic: boolean;
    readonly gemini: boolean;
    readonly openai: boolean;
  };
  readonly providerModels: {
    readonly anthropic: string;
    readonly gemini: string;
    readonly mock: string;
    readonly openai: string;
  };
  readonly supabaseConfigured: boolean;
}

export function parseEnvironment(input: Record<string, string | undefined>): AppEnvironment {
  const parsed = environmentSchema.safeParse(input);

  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]
      .sort()
      .join(', ');

    throw new Error(`Invalid environment configuration: ${variables}`);
  }

  const supabaseConfigured = Boolean(
    parsed.data.NEXT_PUBLIC_SUPABASE_URL && parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return {
    ...(parsed.data.NEXT_PUBLIC_APP_URL ? { appUrl: parsed.data.NEXT_PUBLIC_APP_URL } : {}),
    googleConfigured: Boolean(
      parsed.data.GOOGLE_CLIENT_ID &&
      parsed.data.GOOGLE_CLIENT_SECRET &&
      parsed.data.GOOGLE_REDIRECT_URI,
    ),
    mockMode: parsed.data.NEXT_PUBLIC_MOCK_MODE === 'true' || !supabaseConfigured,
    providers: {
      anthropic: Boolean(parsed.data.ANTHROPIC_API_KEY),
      gemini: Boolean(parsed.data.GEMINI_API_KEY),
      openai: Boolean(parsed.data.OPENAI_API_KEY),
    },
    providerModels: {
      anthropic: parsed.data.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      gemini: parsed.data.GEMINI_MODEL ?? 'gemini-3.6-flash',
      mock: 'mock-planner-v1',
      openai: parsed.data.OPENAI_MODEL ?? 'gpt-5.6-sol',
    },
    supabaseConfigured,
  };
}
