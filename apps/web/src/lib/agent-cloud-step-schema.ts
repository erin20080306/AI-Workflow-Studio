import {
  AgentProtocolError,
  JsonValueSchema,
  type AgentJob,
  type JsonValue,
} from '@ai-workflow-studio/agent-protocol';
import { RunStepResultSchema } from '@ai-workflow-studio/run-orchestrator';
import { z } from 'zod';

export type AgentCloudNode = Extract<
  AgentJob['workflow']['nodes'][number],
  {
    readonly type:
      'ai.summarize' | 'apps_script.deploy_template' | 'google_slides.create' | 'report.compose';
  }
>;

const DesktopExcelProfileSchema = z
  .object({
    columns: z
      .array(
        z
          .object({
            categorical: z
              .object({
                sampledDistinctCount: z.number().int().min(0).max(40),
                topFrequencies: z.array(z.number().int().positive().max(1_000_000)).max(8),
                unprofiledValueCount: z.number().int().min(0).max(1_000_000),
              })
              .strict(),
            id: z.string().regex(/^column_[1-9][0-9]?$/u),
            nonEmptyCount: z.number().int().min(0).max(1_000_000),
            numeric: z
              .object({
                count: z.number().int().min(0).max(1_000_000),
                statistics: z
                  .object({
                    maximum: z.number().finite(),
                    minimum: z.number().finite(),
                    sum: z.number().finite(),
                    sumOverflowed: z.boolean(),
                  })
                  .strict()
                  .optional(),
              })
              .strict(),
            semanticHint: z
              .enum([
                'amount',
                'cost',
                'customer',
                'date',
                'id',
                'item',
                'name',
                'order',
                'price',
                'quantity',
                'status',
                'total',
              ])
              .optional(),
          })
          .strict(),
      )
      .max(40),
    fileCount: z.number().int().min(1).max(500),
    kind: z.literal('desktop_excel_profile'),
    rowCount: z.number().int().min(0).max(1_000_000),
    sheetCount: z.number().int().min(1).max(2_000),
    truncatedColumns: z.number().int().min(0).max(1_000_000),
  })
  .strict()
  .superRefine((profile, context) => {
    profile.columns.forEach((column, index) => {
      if (column.id !== `column_${index + 1}`) {
        context.addIssue({
          code: 'custom',
          message: 'Profile column identifiers must be sequential.',
          path: ['columns', index, 'id'],
        });
      }
      if (column.nonEmptyCount > profile.rowCount) {
        context.addIssue({
          code: 'custom',
          message: 'Profile column counts must not exceed the total row count.',
          path: ['columns', index, 'nonEmptyCount'],
        });
      }
      if (column.numeric.count > column.nonEmptyCount) {
        context.addIssue({
          code: 'custom',
          message: 'Numeric counts must not exceed non-empty counts.',
          path: ['columns', index, 'numeric', 'count'],
        });
      }
      if (column.numeric.statistics !== undefined) {
        if (
          column.numeric.count < 5 ||
          !['amount', 'cost', 'price', 'quantity', 'total'].includes(column.semanticHint ?? '') ||
          column.numeric.statistics.minimum > column.numeric.statistics.maximum
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Numeric statistics require a bounded metric cohort.',
            path: ['columns', index, 'numeric', 'statistics'],
          });
        }
      }
      const categoricalCount = column.nonEmptyCount - column.numeric.count;
      const visibleFrequencyCount = column.categorical.topFrequencies.reduce(
        (sum, value) => sum + value,
        0,
      );
      if (
        column.categorical.topFrequencies.length > column.categorical.sampledDistinctCount ||
        visibleFrequencyCount + column.categorical.unprofiledValueCount > categoricalCount
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Categorical profile counts are inconsistent.',
          path: ['columns', index, 'categorical'],
        });
      }
    });
  });

export function validateDesktopExcelProfile(input: unknown): JsonValue {
  return JsonValueSchema.parse(DesktopExcelProfileSchema.parse(input));
}

export function validateAgentCloudStepInput(node: AgentCloudNode, input: unknown): JsonValue {
  if (node.type === 'ai.summarize') {
    return validateDesktopExcelProfile(input);
  }
  const result = RunStepResultSchema.parse(input);
  const accepted =
    (node.type === 'report.compose' && result.kind === 'ai_summary') ||
    (node.type === 'google_slides.create' && result.kind === 'business_report') ||
    (node.type === 'apps_script.deploy_template' &&
      (result.kind === 'business_report' || result.kind === 'google_slides_presentation'));
  if (!accepted) {
    throw new AgentProtocolError(
      'AGENT_REQUEST_INVALID',
      'The cloud continuation input does not match the approved predecessor result.',
    );
  }
  return JsonValueSchema.parse(result);
}
