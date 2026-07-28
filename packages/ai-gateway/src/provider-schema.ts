import { AIPlannerOutputSchema } from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

/**
 * The canonical provider schema is derived from the same strict Zod contract
 * used after generation. Provider adapters may choose JSON mode when a model
 * does not support every keyword in this schema; the gateway always performs
 * the authoritative Zod and semantic validation before releasing a plan.
 */
export const PLANNER_PROVIDER_JSON_SCHEMA = z.toJSONSchema(AIPlannerOutputSchema);
