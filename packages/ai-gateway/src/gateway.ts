import type { WorkflowValidationIssue } from '@ai-workflow-studio/workflow-schema';

import { AiGatewayError } from './errors';
import { parseStrictPlannerOutput } from './json';
import { buildPlannerSafeFallback, buildPlannerUserPrompt, PLANNER_SYSTEM_PROMPT } from './prompts';
import { PLANNER_PROVIDER_JSON_SCHEMA } from './provider-schema';
import type {
  AiProviderAdapter,
  PlannerRequest,
  PlannerResult,
  ProviderTokenUsage,
  UsageSink,
} from './types';
import { PlannerRequestSchema } from './types';
import { recordUsage } from './usage';
import { validateWorkflowIntentCoverage } from './workflow-intent';

function addUsage(left: ProviderTokenUsage, right: ProviderTokenUsage): ProviderTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

export class AiGateway {
  constructor(
    private readonly adapter: AiProviderAdapter,
    private readonly usageSink: UsageSink,
  ) {}

  async plan(input: unknown, signal?: AbortSignal): Promise<PlannerResult> {
    const parsedRequest = PlannerRequestSchema.safeParse(input);
    if (!parsedRequest.success) {
      throw new AiGatewayError('AI_REQUEST_INVALID', 'AI planning request is invalid.', {
        details: {
          paths: parsedRequest.error.issues.map((issue) => issue.path.map(String).join('.')),
        },
      });
    }

    const request: PlannerRequest = parsedRequest.data;
    const maxAttempts = request.maxRepairAttempts + 1;
    let priorIssues: readonly WorkflowValidationIssue[] = [];
    let aggregateUsage: ProviderTokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      let completion;
      try {
        completion = await this.adapter.complete({
          attempt,
          jsonSchema: PLANNER_PROVIDER_JSON_SCHEMA,
          maxOutputTokens: 4_096,
          operation: 'workflow_plan',
          plannerRequest: request,
          schemaName: 'workflow_plan',
          ...(signal === undefined ? {} : { signal }),
          systemPrompt: PLANNER_SYSTEM_PROMPT,
          userPrompt: buildPlannerUserPrompt(request, priorIssues),
        });
      } catch (error) {
        await recordUsage(this.usageSink, {
          attempt,
          durationMs: Math.max(0, Date.now() - startedAt),
          inputTokens: 0,
          model: this.adapter.model,
          operation: 'workflow_plan',
          outcome: 'failed',
          outputTokens: 0,
          provider: this.adapter.provider,
          validationCodes: [],
        });
        throw error;
      }

      aggregateUsage = addUsage(aggregateUsage, completion.usage);
      const parsedOutput = parseStrictPlannerOutput(completion.text);
      const intentIssues =
        parsedOutput.success && parsedOutput.output !== undefined
          ? validateWorkflowIntentCoverage(request, parsedOutput.output)
          : [];
      const validation =
        parsedOutput.success && intentIssues.length > 0
          ? { issues: intentIssues, success: false as const }
          : parsedOutput;
      const validationCodes = [...new Set(validation.issues.map((issue) => issue.code))].sort();
      const fallback =
        !validation.success && intentIssues.length === 0 && attempt === maxAttempts
          ? buildPlannerSafeFallback(request, validation.issues)
          : undefined;
      await recordUsage(this.usageSink, {
        attempt,
        durationMs: Math.max(0, Date.now() - startedAt),
        inputTokens: completion.usage.inputTokens,
        model: completion.model,
        operation: 'workflow_plan',
        outcome: validation.success || fallback !== undefined ? 'succeeded' : 'invalid',
        outputTokens: completion.usage.outputTokens,
        provider: this.adapter.provider,
        validationCodes,
      });

      const output = validation.success ? validation.output : fallback;
      if (output !== undefined) {
        return {
          attempts: attempt,
          model: completion.model,
          output,
          provider: this.adapter.provider,
          usage: aggregateUsage,
        };
      }
      priorIssues = validation.issues;
    }

    throw new AiGatewayError(
      'AI_OUTPUT_INVALID',
      'AI output did not pass workflow validation within the repair limit.',
      {
        details: {
          attempts: maxAttempts,
          validationCodes: [...new Set(priorIssues.map((issue) => issue.code))].sort(),
        },
      },
    );
  }
}
