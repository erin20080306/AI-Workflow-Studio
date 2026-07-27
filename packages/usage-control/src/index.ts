import {
  AI_MODEL_TIERS,
  PRODUCT_PLANS,
  type AiModelTier,
  type PlanCode,
  type ProductPlan,
} from '@ai-workflow-studio/shared/plans';
import { z } from 'zod';

export const UsageProviderSchema = z.enum(['anthropic', 'gemini', 'mock', 'openai']);
export type UsageProvider = z.infer<typeof UsageProviderSchema>;
export const AiModelTierSchema = z.enum(AI_MODEL_TIERS);
export type { AiModelTier };
export const AiModelTierSelectionSchema = z.enum(['auto', ...AI_MODEL_TIERS]);
export type AiModelTierSelection = z.infer<typeof AiModelTierSelectionSchema>;

export const UsageBudgetLevelSchema = z.enum(['normal', 'warning', 'critical', 'blocked']);
export type UsageBudgetLevel = z.infer<typeof UsageBudgetLevelSchema>;

export const UsageOperationSchema = z.enum([
  'chat',
  'workflow_plan',
  'source_upload',
  'tool_call',
  'website_generation',
  'website_image_generation',
]);
export type UsageOperation = z.infer<typeof UsageOperationSchema>;

export const UsageBudgetSnapshotSchema = z
  .object({
    budgetMicrounits: z.number().int().nonnegative(),
    level: UsageBudgetLevelSchema,
    percentUsed: z.number().min(0),
    remainingMicrounits: z.number().int().nonnegative(),
    reservedMicrounits: z.number().int().nonnegative(),
    usedMicrounits: z.number().int().nonnegative(),
  })
  .strict();
export type UsageBudgetSnapshot = z.infer<typeof UsageBudgetSnapshotSchema>;

/**
 * Internal conservative guard rates, expressed as micro-TWD per one million
 * tokens. They are deliberately versioned budget estimates, not a provider
 * invoice or a claim about current public pricing.
 */
export const INTERNAL_RATE_CARD_VERSION = '2026-07-tiered-v2';

const INTERNAL_RATE_CARD = {
  anthropic: { input: 40_000_000, output: 190_000_000 },
  gemini: { input: 12_000_000, output: 90_000_000 },
  mock: { input: 0, output: 0 },
  openai: { input: 40_000_000, output: 220_000_000 },
} as const satisfies Readonly<
  Record<UsageProvider, { readonly input: number; readonly output: number }>
>;

export function getProductPlan(planCode: PlanCode): ProductPlan {
  const plan = PRODUCT_PLANS.find((candidate) => candidate.code === planCode);
  if (plan === undefined) {
    throw new Error('Configured product plan is missing.');
  }
  return plan;
}

export function estimateTextTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.max(1, Math.ceil([...text].length / 3));
}

export function estimateAiCostMicrounits(
  provider: UsageProvider,
  inputTokens: number,
  outputTokens: number,
  costMultiplier = 1,
): number {
  const input = z.number().int().nonnegative().parse(inputTokens);
  const output = z.number().int().nonnegative().parse(outputTokens);
  const multiplier = z.number().min(0).max(100).parse(costMultiplier);
  const rate = INTERNAL_RATE_CARD[provider];
  return Math.ceil(((input * rate.input + output * rate.output) / 1_000_000) * multiplier);
}

export function estimateMaximumAiCostMicrounits(input: {
  readonly inputCharacters: number;
  readonly maxAttempts?: number;
  readonly maxOutputTokens: number;
  readonly costMultiplier?: number;
  readonly provider: UsageProvider;
}): number {
  const characters = z.number().int().nonnegative().parse(input.inputCharacters);
  const maxOutputTokens = z.number().int().positive().max(16_384).parse(input.maxOutputTokens);
  const attempts = z
    .number()
    .int()
    .min(1)
    .max(3)
    .parse(input.maxAttempts ?? 1);
  return (
    estimateAiCostMicrounits(
      input.provider,
      estimateTextTokens('x'.repeat(Math.min(characters, 100_000))),
      maxOutputTokens,
      input.costMultiplier,
    ) * attempts
  );
}

export function isAiModelTierAllowed(planCode: PlanCode, tier: AiModelTier): boolean {
  const maximumIndex = AI_MODEL_TIERS.indexOf(getProductPlan(planCode).maximumAiModelTier);
  return AI_MODEL_TIERS.indexOf(tier) <= maximumIndex;
}

export function allowedAiModelTiers(planCode: PlanCode): readonly AiModelTier[] {
  return AI_MODEL_TIERS.filter((tier) => isAiModelTierAllowed(planCode, tier));
}

export function evaluateUsageBudget(input: {
  readonly budgetMicrounits: number;
  readonly reservedMicrounits?: number;
  readonly usedMicrounits: number;
}): UsageBudgetSnapshot {
  const budgetMicrounits = z.number().int().nonnegative().parse(input.budgetMicrounits);
  const reservedMicrounits = z
    .number()
    .int()
    .nonnegative()
    .parse(input.reservedMicrounits ?? 0);
  const usedMicrounits = z.number().int().nonnegative().parse(input.usedMicrounits);
  const total = usedMicrounits + reservedMicrounits;
  const percentUsed =
    budgetMicrounits === 0 ? (total === 0 ? 0 : 100) : (total / budgetMicrounits) * 100;
  const level: UsageBudgetLevel =
    percentUsed >= 100
      ? 'blocked'
      : percentUsed >= 95
        ? 'critical'
        : percentUsed >= 80
          ? 'warning'
          : 'normal';

  return UsageBudgetSnapshotSchema.parse({
    budgetMicrounits,
    level,
    percentUsed,
    remainingMicrounits: Math.max(0, budgetMicrounits - total),
    reservedMicrounits,
    usedMicrounits,
  });
}

export function canReserveUsage(
  snapshot: UsageBudgetSnapshot,
  requestedMicrounits: number,
): boolean {
  const requested = z.number().int().nonnegative().parse(requestedMicrounits);
  return (
    snapshot.level !== 'blocked' &&
    snapshot.usedMicrounits + snapshot.reservedMicrounits + requested <= snapshot.budgetMicrounits
  );
}

export function microunitsToTwd(value: number): number {
  return z.number().int().nonnegative().parse(value) / 1_000_000;
}
