import { z } from 'zod';

const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalSecret = z.preprocess(emptyToUndefined, z.string().min(24).optional());
const optionalEncryptionKey = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .refine(
      (value) =>
        /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, 'base64').byteLength === 32,
      {
        message: 'Encryption key must decode to 32 bytes',
      },
    )
    .optional(),
);
const optionalModel = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^[A-Za-z0-9._:-]{2,120}$/)
    .optional(),
);
const storePlanMappings = z.preprocess(
  (value) => {
    const normalized = emptyToUndefined(value);
    if (typeof normalized !== 'string') return normalized;
    try {
      return JSON.parse(normalized) as unknown;
    } catch {
      return normalized;
    }
  },
  z
    .array(
      z
        .object({
          plan: z.enum(['pro', 'team', 'business']),
          productId: z.string().trim().min(1).max(200),
          skuId: z.string().trim().min(1).max(200),
        })
        .strict(),
    )
    .min(1)
    .max(12)
    .optional(),
);

const environmentSchema = z.object({
  AGENT_TOKEN_PEPPER: optionalSecret,
  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL: optionalModel,
  APP_ENCRYPTION_KEY: optionalEncryptionKey,
  CRON_SECRET: optionalSecret,
  GEMINI_API_KEY: optionalSecret,
  GEMINI_MODEL: optionalModel,
  GITHUB_APP_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().min(10).max(160).optional()),
  GITHUB_APP_CLIENT_SECRET: optionalSecret,
  GITHUB_APP_ID: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[1-9][0-9]{0,19}$/)
      .optional(),
  ),
  GITHUB_APP_PRIVATE_KEY_BASE64: z.preprocess(
    emptyToUndefined,
    z.string().min(256).max(16_000).optional(),
  ),
  GITHUB_APP_SLUG: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
  ),
  GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  GOOGLE_CLIENT_SECRET: optionalSecret,
  GOOGLE_REDIRECT_URI: optionalUrl,
  MICROSOFT_STORE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  MICROSOFT_STORE_CLIENT_SECRET: optionalSecret,
  MICROSOFT_STORE_PLAN_MAPPINGS: storePlanMappings,
  MICROSOFT_STORE_TENANT_ID: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_MOCK_MODE: z.enum(['true', 'false']).default('true'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional(),
  ),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: optionalModel,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
});

export interface AppEnvironment {
  readonly appUrl?: string;
  readonly googleConfigured: boolean;
  readonly github: {
    readonly appSlug?: string;
    readonly configured: boolean;
  };
  readonly mockMode: boolean;
  readonly microsoftStore: {
    readonly configured: boolean;
    readonly planMappings: readonly {
      readonly plan: 'pro' | 'team' | 'business';
      readonly productId: string;
      readonly skuId: string;
    }[];
  };
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
    parsed.data.NEXT_PUBLIC_SUPABASE_URL &&
    (parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
  const microsoftStoreConfigured = Boolean(
    parsed.data.MICROSOFT_STORE_TENANT_ID &&
    parsed.data.MICROSOFT_STORE_CLIENT_ID &&
    parsed.data.MICROSOFT_STORE_CLIENT_SECRET &&
    parsed.data.MICROSOFT_STORE_PLAN_MAPPINGS?.length,
  );
  const githubConfigured = Boolean(
    parsed.data.GITHUB_APP_ID &&
    parsed.data.GITHUB_APP_CLIENT_ID &&
    parsed.data.GITHUB_APP_CLIENT_SECRET &&
    parsed.data.GITHUB_APP_PRIVATE_KEY_BASE64 &&
    parsed.data.GITHUB_APP_SLUG,
  );

  return {
    ...(parsed.data.NEXT_PUBLIC_APP_URL ? { appUrl: parsed.data.NEXT_PUBLIC_APP_URL } : {}),
    googleConfigured: Boolean(
      parsed.data.GOOGLE_CLIENT_ID &&
      parsed.data.GOOGLE_CLIENT_SECRET &&
      parsed.data.GOOGLE_REDIRECT_URI &&
      parsed.data.APP_ENCRYPTION_KEY,
    ),
    github: {
      ...(parsed.data.GITHUB_APP_SLUG ? { appSlug: parsed.data.GITHUB_APP_SLUG } : {}),
      configured: githubConfigured,
    },
    mockMode: parsed.data.NEXT_PUBLIC_MOCK_MODE === 'true' || !supabaseConfigured,
    microsoftStore: {
      configured: microsoftStoreConfigured,
      planMappings: parsed.data.MICROSOFT_STORE_PLAN_MAPPINGS ?? [],
    },
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
