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
            name: z.string().min(1).max(200),
            nonEmptyCount: z.number().int().nonnegative(),
            numeric: z
              .object({
                count: z.number().int().nonnegative(),
                maximum: z.number().finite().optional(),
                minimum: z.number().finite().optional(),
                sum: z.number().finite(),
                sumOverflowed: z.boolean(),
              })
              .strict(),
            otherValueCount: z.number().int().nonnegative(),
            topValues: z
              .array(
                z
                  .object({
                    count: z.number().int().positive(),
                    value: z.string().max(80),
                  })
                  .strict(),
              )
              .max(8),
          })
          .strict(),
      )
      .max(40),
    fileCount: z.number().int().nonnegative(),
    kind: z.literal('desktop_excel_profile'),
    rowCount: z.number().int().nonnegative(),
    sheetCount: z.number().int().nonnegative(),
    sheetNames: z.array(z.string().min(1).max(200)).max(30),
    truncatedColumns: z.number().int().nonnegative(),
    truncatedSheetNames: z.number().int().nonnegative(),
  })
  .strict();

export function validateAgentCloudStepInput(node: AgentCloudNode, input: unknown): JsonValue {
  if (node.type === 'ai.summarize') {
    return JsonValueSchema.parse(DesktopExcelProfileSchema.parse(input));
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
