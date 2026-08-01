import 'server-only';

import { AiGatewayError, type AiProviderName } from '@ai-workflow-studio/ai-gateway';
import { AI_MODEL_TIERS, type AiModelTier, type PlanCode } from '@ai-workflow-studio/shared/plans';
import {
  AiModelTierSchema,
  getProductPlan,
  isAiModelTierAllowed,
  type AiModelTierSelection,
  type UsageBudgetLevel,
  type UsageOperation,
} from '@ai-workflow-studio/usage-control';
import { z } from 'zod';

import {
  DEFAULT_AI_MODEL_MAPPINGS,
  ProductionAiProviderSchema,
  isAccountModelCompatibleWithTier,
  resolveAccountModelForTier,
  type AiModelMapping,
  type OpenAiReasoningEffort,
  type ProductionAiProvider,
} from '@/lib/ai-model-catalog';
import { getAiProviderHealth, type AiProviderHealthStatus } from '@/lib/ai-provider-health';
import type { AiProviderSelection } from '@/lib/ai-model-selection';
import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { getTenantUsageSnapshot } from '@/lib/usage-control-server';

const ReasoningEffortSchema = z.enum(['low', 'medium', 'high']).nullable();
const ModelMappingRowSchema = z
  .object({
    cost_multiplier: z.number().min(0.1).max(100),
    enabled: z.boolean(),
    model: z.string().regex(/^[A-Za-z0-9._:-]{2,120}$/),
    provider: ProductionAiProviderSchema,
    reasoning_effort: ReasoningEffortSchema,
    tier: AiModelTierSchema,
  })
  .strict();

export interface ResolvedAiModelRoute extends Omit<AiModelMapping, 'provider'> {
  readonly provider: AiProviderName;
  readonly plan: PlanCode;
}

function isAllowedMapping(mapping: AiModelMapping): boolean {
  return isAccountModelCompatibleWithTier(mapping.provider, mapping.tier, mapping.model);
}

export async function listAiModelMappings(): Promise<readonly AiModelMapping[]> {
  if (getEnvironment().mockMode) {
    return DEFAULT_AI_MODEL_MAPPINGS;
  }

  const result = await createSupabaseAdminClient()
    .from('ai_model_tier_mappings')
    .select('provider, tier, model, enabled, cost_multiplier, reasoning_effort')
    .order('provider')
    .order('tier');
  const parsed = z.array(ModelMappingRowSchema).safeParse(result.data);
  if (result.error !== null || !parsed.success) {
    throw new AiGatewayError(
      'AI_PROVIDER_NOT_CONFIGURED',
      'AI model tier mappings are not available.',
    );
  }
  const mappings = parsed.data
    .map((row): AiModelMapping => ({
      costMultiplier: row.cost_multiplier,
      enabled: row.enabled,
      model: row.model,
      provider: row.provider,
      ...(row.reasoning_effort === null ? {} : { reasoningEffort: row.reasoning_effort }),
      tier: row.tier,
    }))
    .sort((left, right) => AI_MODEL_TIERS.indexOf(left.tier) - AI_MODEL_TIERS.indexOf(right.tier));
  if (!mappings.every(isAllowedMapping)) {
    throw new AiGatewayError(
      'AI_PROVIDER_NOT_CONFIGURED',
      'AI model tier mappings failed the server allowlist.',
    );
  }
  return mappings;
}

export type { OpenAiReasoningEffort };

export async function listAccountAvailableAiModelMappings(): Promise<readonly AiModelMapping[]> {
  const mappings = await listAiModelMappings();
  if (getEnvironment().mockMode) return mappings;

  const healthByProvider = new Map(
    (
      await Promise.all(
        ProductionAiProviderSchema.options.map(async (provider) => {
          const health = await getAiProviderHealth(provider);
          return [provider, health] as const;
        }),
      )
    ).map((entry) => entry),
  );

  return mappings.map((mapping) => {
    const health = healthByProvider.get(mapping.provider);
    if (health?.status !== 'available') return { ...mapping, enabled: false };
    const model = resolveAccountModelForTier(
      mapping.provider,
      mapping.tier,
      mapping.model,
      health.models,
    );
    return model === undefined ? { ...mapping, enabled: false } : { ...mapping, model };
  });
}

function effectivePlan(context: WorkspaceContext): PlanCode {
  if (context.platformAdmin) return 'business';
  return ['active', 'past_due', 'trialing'].includes(context.subscription.status)
    ? context.subscription.plan
    : 'free';
}

function maximumTierForBudget(plan: PlanCode, level: UsageBudgetLevel): AiModelTier {
  const planMaximum = getProductPlan(plan).maximumAiModelTier;
  if (level === 'critical' || level === 'blocked') {
    return 'economy';
  }
  if (level === 'warning') {
    return AI_MODEL_TIERS.indexOf(planMaximum) > AI_MODEL_TIERS.indexOf('standard')
      ? 'standard'
      : planMaximum;
  }
  return planMaximum;
}

function recommendedTier(
  operation: Extract<UsageOperation, 'chat' | 'workflow_plan' | 'website_generation'>,
): AiModelTier {
  if (operation === 'chat') return 'economy';
  if (operation === 'workflow_plan') return 'standard';
  return 'advanced';
}

function lowerTier(left: AiModelTier, right: AiModelTier): AiModelTier {
  return AI_MODEL_TIERS[
    Math.min(AI_MODEL_TIERS.indexOf(left), AI_MODEL_TIERS.indexOf(right))
  ] as AiModelTier;
}

function providerPriority(
  operation: Extract<UsageOperation, 'chat' | 'workflow_plan' | 'website_generation'>,
  tier: AiModelTier,
): readonly ProductionAiProvider[] {
  if (tier === 'economy') {
    return ['gemini', 'openai', 'anthropic'];
  }
  if (operation === 'chat') {
    return ['gemini', 'openai', 'anthropic'];
  }
  return ['openai', 'anthropic', 'gemini'];
}

function providerHealthError(status: AiProviderHealthStatus): AiGatewayError {
  if (status === 'authentication_failed') {
    return new AiGatewayError(
      'AI_PROVIDER_AUTHENTICATION_FAILED',
      'The selected AI provider credential could not be authenticated.',
    );
  }
  if (status === 'rate_limited') {
    return new AiGatewayError(
      'AI_PROVIDER_RATE_LIMITED',
      'The selected AI provider has reached its current quota or rate limit.',
      { retryable: true },
    );
  }
  if (status === 'not_configured') {
    return new AiGatewayError(
      'AI_PROVIDER_NOT_CONFIGURED',
      'The selected AI provider is not configured.',
    );
  }
  return new AiGatewayError(
    'AI_PROVIDER_REQUEST_FAILED',
    'The selected AI provider could not be reached for a readiness check.',
    { retryable: true },
  );
}

export async function resolveAiModelRoute(
  context: WorkspaceContext,
  input: {
    readonly excludedProviders?: readonly AiProviderName[];
    readonly operation: Extract<UsageOperation, 'chat' | 'workflow_plan' | 'website_generation'>;
    readonly provider: AiProviderSelection;
    readonly tier: AiModelTierSelection;
  },
): Promise<ResolvedAiModelRoute> {
  const environment = getEnvironment();
  const plan = effectivePlan(context);
  const snapshot = await getTenantUsageSnapshot(context);
  const budgetMaximum = context.platformAdmin
    ? ('flagship' as const)
    : maximumTierForBudget(plan, snapshot.ai.level);
  const requestedTier =
    input.tier === 'auto' ? lowerTier(recommendedTier(input.operation), budgetMaximum) : input.tier;

  if (!isAiModelTierAllowed(plan, requestedTier)) {
    throw new AiGatewayError(
      'AI_REQUEST_INVALID',
      'The selected AI model level is not included in this subscription.',
    );
  }
  if (!context.platformAdmin && snapshot.ai.level === 'blocked') {
    throw new AiGatewayError('AI_REQUEST_INVALID', 'The monthly AI allowance has been reached.');
  }

  if (environment.mockMode) {
    return {
      costMultiplier: 0,
      enabled: true,
      model: environment.providerModels.mock,
      plan,
      provider: 'mock',
      tier: requestedTier,
    };
  }

  const mappings = await listAiModelMappings();
  const requestedProviders =
    input.provider === 'auto'
      ? providerPriority(input.operation, requestedTier)
      : input.provider === 'mock'
        ? []
        : [input.provider];
  let explicitProviderError: AiGatewayError | undefined;
  for (const provider of requestedProviders) {
    if (input.excludedProviders?.includes(provider) === true) continue;
    if (!environment.providers[provider]) continue;
    const mapping = mappings.find(
      (candidate) =>
        candidate.provider === provider && candidate.tier === requestedTier && candidate.enabled,
    );
    if (mapping === undefined) continue;

    const health = await getAiProviderHealth(provider);
    if (health.status !== 'available') {
      if (input.provider !== 'auto') explicitProviderError = providerHealthError(health.status);
      continue;
    }
    const model = resolveAccountModelForTier(
      mapping.provider,
      mapping.tier,
      mapping.model,
      health.models,
    );
    if (model === undefined) {
      if (input.provider !== 'auto') {
        explicitProviderError = new AiGatewayError(
          'AI_PROVIDER_NOT_CONFIGURED',
          'No tier-compatible text model is available to this provider account.',
        );
      }
      continue;
    }
    return { ...mapping, model, plan };
  }

  if (explicitProviderError !== undefined) throw explicitProviderError;
  throw new AiGatewayError(
    'AI_PROVIDER_NOT_CONFIGURED',
    'No verified provider and model are available for the selected model level.',
  );
}
