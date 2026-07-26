import { z } from 'zod';

import { AiGatewayError } from '../errors';

const ProviderConfigSchema = z
  .object({
    apiKey: z.string().min(20),
    baseUrl: z.string().url(),
    model: z.string().regex(/^[A-Za-z0-9._:-]{2,120}$/),
  })
  .strict();

export interface ValidatedProviderConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
}

export function validateProviderConfig(
  input: ValidatedProviderConfig,
  provider: string,
): ValidatedProviderConfig {
  const result = ProviderConfigSchema.safeParse(input);
  if (!result.success) {
    throw new AiGatewayError(
      'AI_PROVIDER_NOT_CONFIGURED',
      `${provider} provider configuration is incomplete.`,
    );
  }
  return result.data;
}
