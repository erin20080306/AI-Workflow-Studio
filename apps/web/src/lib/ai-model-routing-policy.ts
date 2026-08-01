import { AI_MODEL_TIERS, type AiModelTier } from '@ai-workflow-studio/shared/plans';
import type { AiModelTierSelection } from '@ai-workflow-studio/usage-control';

export function candidateRoutingTiers(
  selection: AiModelTierSelection,
  requestedTier: AiModelTier,
): readonly AiModelTier[] {
  if (selection !== 'auto') return [requestedTier];
  const requestedIndex = AI_MODEL_TIERS.indexOf(requestedTier);
  return AI_MODEL_TIERS.slice(0, requestedIndex + 1).reverse();
}
