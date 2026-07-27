import 'server-only';

import type { AiModelTier, PlanCode } from '@ai-workflow-studio/shared/plans';
import {
  getProductPlan,
  isAiModelTierAllowed,
  type AiModelTierSelection,
} from '@ai-workflow-studio/usage-control';

import { getAiProviderHealth } from '@/lib/ai-provider-health';
import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import {
  WEBSITE_IMAGE_MODELS_BY_TIER,
  type WebsiteImageProvider,
} from '@/lib/website-image-models';
import { WebsiteStudioError } from '@/lib/website-studio-server';
import { getTenantUsageSnapshot } from '@/lib/usage-control-server';

const IMAGE_COST_MICROUNITS = {
  gemini: {
    advanced: 8_000_000,
    economy: 2_000_000,
    flagship: 16_000_000,
    standard: 4_000_000,
  },
  openai: {
    advanced: 12_000_000,
    economy: 3_000_000,
    flagship: 24_000_000,
    standard: 6_000_000,
  },
} as const satisfies Readonly<Record<WebsiteImageProvider, Readonly<Record<AiModelTier, number>>>>;

export interface ResolvedWebsiteImageRoute {
  readonly maximumCostMicrounits: number;
  readonly model: string;
  readonly plan: PlanCode;
  readonly provider: WebsiteImageProvider | 'mock';
  readonly tier: AiModelTier;
}

function effectivePlan(context: WorkspaceContext): PlanCode {
  return ['active', 'past_due', 'trialing'].includes(context.subscription.status)
    ? context.subscription.plan
    : 'free';
}

function imageTier(
  plan: PlanCode,
  selected: AiModelTierSelection,
  budgetLevel: 'blocked' | 'critical' | 'normal' | 'warning',
): AiModelTier {
  if (selected !== 'auto') return selected;
  if (budgetLevel === 'warning' || budgetLevel === 'critical') return 'economy';
  return plan === 'free' ? 'economy' : 'standard';
}

function providerFailure(): WebsiteStudioError {
  return new WebsiteStudioError(
    'WEBSITE_PROVIDER_UNAVAILABLE',
    'No configured image-capable provider is currently available.',
  );
}

export async function resolveWebsiteImageRoute(
  context: WorkspaceContext,
  input: {
    readonly provider: 'auto' | WebsiteImageProvider;
    readonly tier: AiModelTierSelection;
  },
): Promise<ResolvedWebsiteImageRoute> {
  const plan = effectivePlan(context);
  const snapshot = await getTenantUsageSnapshot(context);
  if (snapshot.ai.level === 'blocked') {
    throw new WebsiteStudioError('WEBSITE_FORBIDDEN', 'The monthly AI allowance has been reached.');
  }
  const tier = imageTier(plan, input.tier, snapshot.ai.level);
  if (!isAiModelTierAllowed(plan, tier)) {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'The selected image level is not included in this subscription.',
    );
  }

  const environment = getEnvironment();
  if (environment.mockMode) {
    return {
      maximumCostMicrounits: 0,
      model: 'mock-image-v1',
      plan,
      provider: 'mock',
      tier,
    };
  }

  const candidates: readonly WebsiteImageProvider[] =
    input.provider === 'auto' ? ['gemini', 'openai'] : [input.provider];
  for (const provider of candidates) {
    if (!environment.providers[provider]) continue;
    const health = await getAiProviderHealth(provider);
    if (health.status !== 'available') continue;
    return {
      maximumCostMicrounits: IMAGE_COST_MICROUNITS[provider][tier],
      model: WEBSITE_IMAGE_MODELS_BY_TIER[provider][tier],
      plan,
      provider,
      tier,
    };
  }
  throw providerFailure();
}

export function assertWebsiteImageRequestCost(route: ResolvedWebsiteImageRoute): void {
  if (route.maximumCostMicrounits > getProductPlan(route.plan).maximumAiRequestCostMicrounits) {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'This image would exceed the subscription single-request cost ceiling.',
    );
  }
}
