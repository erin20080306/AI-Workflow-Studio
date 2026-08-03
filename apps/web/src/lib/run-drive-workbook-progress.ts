import type { RunStepView } from '@ai-workflow-studio/run-orchestrator';
import { WorkbookBatchProgressSchema } from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

const PersistedDriveCheckpointProgressSchema = z.object({
  kind: z.literal('google_drive_excel_checkpoint'),
  manifest: z.object({
    files: z.array(z.unknown()).min(1).max(500),
  }),
});

interface DriveWorkbookProgressInput {
  readonly nodeType: string;
  readonly outputSummary: Readonly<Record<string, unknown>>;
  readonly status: string;
}

export function driveWorkbookProgressForRunStep(
  input: DriveWorkbookProgressInput,
): RunStepView['driveWorkbookProgress'] {
  if (input.nodeType === 'excel.read' && input.status === 'running') {
    const progress = WorkbookBatchProgressSchema.safeParse(input.outputSummary);
    return progress.success
      ? { phase: 'batching', totalWorkbookCount: progress.data.totalWorkbookCount }
      : undefined;
  }
  if (input.nodeType !== 'google_drive.read_excel_folder' || input.status !== 'running') {
    return undefined;
  }

  const checkpoint = PersistedDriveCheckpointProgressSchema.safeParse(input.outputSummary);
  if (!checkpoint.success) {
    return { phase: 'scanning' };
  }

  return {
    phase: 'batching',
    totalWorkbookCount: checkpoint.data.manifest.files.length,
  };
}
