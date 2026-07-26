import {
  AIPlannerOutputSchema,
  validateWorkflow,
  type AIPlannerOutput,
  type WorkflowValidationIssue,
} from '@ai-workflow-studio/workflow-schema';

const MAX_PROVIDER_OUTPUT_BYTES = 1_000_000;

export interface PlannerOutputValidation {
  readonly issues: readonly WorkflowValidationIssue[];
  readonly output?: AIPlannerOutput;
  readonly success: boolean;
}

function schemaIssues(message: string, path?: string): readonly WorkflowValidationIssue[] {
  return [
    {
      code: 'WORKFLOW_SCHEMA_INVALID',
      message,
      ...(path === undefined ? {} : { path }),
    },
  ];
}

export function parseStrictPlannerOutput(text: string): PlannerOutputValidation {
  if (new TextEncoder().encode(text).byteLength > MAX_PROVIDER_OUTPUT_BYTES) {
    return {
      issues: schemaIssues('Provider output exceeds the maximum accepted size.'),
      success: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return {
      issues: schemaIssues('Provider output is not a single valid JSON value.'),
      success: false,
    };
  }

  const plannerOutput = AIPlannerOutputSchema.safeParse(parsed);
  if (!plannerOutput.success) {
    return {
      issues: plannerOutput.error.issues.map((issue) => ({
        code: 'WORKFLOW_SCHEMA_INVALID',
        message: issue.message,
        path: issue.path.map(String).join('.'),
      })),
      success: false,
    };
  }

  const semantic = validateWorkflow(plannerOutput.data.workflow);
  if (!semantic.success) {
    return {
      issues: semantic.issues,
      success: false,
    };
  }

  return {
    issues: [],
    output: plannerOutput.data,
    success: true,
  };
}
