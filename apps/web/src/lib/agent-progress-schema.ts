import {
  AgentProtocolError,
  ProgressJobRequestSchema,
  type AgentJob,
  type ProgressJobRequest,
} from '@ai-workflow-studio/agent-protocol';
import { z } from 'zod';

import { type AgentCloudNode, validateDesktopExcelProfile } from './agent-cloud-step-schema';

const AGENT_CLOUD_NODE_TYPES = new Set<string>([
  'ai.summarize',
  'report.compose',
  'google_slides.create',
  'apps_script.deploy_template',
]);

const VisibleDriveProgressSchema = z
  .object({
    computerUseAction: z.enum([
      'drive.download_items',
      'drive.open_folder',
      'drive.select_items',
      'drive.verify_download',
    ]),
  })
  .strict();

const VisibleExcelProgressSchema = z
  .object({
    computerUseAction: z.enum([
      'excel.autofit_used_range',
      'excel.open_workbook',
      'excel.save_workbook',
      'excel.verify_active_workbook',
    ]),
  })
  .strict();

function invalidProgress(message: string): never {
  throw new AgentProtocolError('AGENT_REQUEST_INVALID', message);
}

function isDirectAiSummaryPredecessor(job: AgentJob, nodeId: string): boolean {
  return job.workflow.edges.some((edge) => {
    if (edge.from !== nodeId) return false;
    return job.workflow.nodes.some(
      (candidate) => candidate.id === edge.to && candidate.type === 'ai.summarize',
    );
  });
}

/**
 * Validates Agent progress before the generic event store sees it. Local paths,
 * workbook rows, and cloud results are never accepted by this channel.
 */
function parseAgentProgressRequest(job: AgentJob, input: unknown): ProgressJobRequest {
  const parsed = ProgressJobRequestSchema.parse(input);
  const node = job.workflow.nodes.find((candidate) => candidate.id === parsed.step.nodeId);
  if (node === undefined) {
    return invalidProgress('The progress node is not part of the claimed workflow.');
  }
  if (AGENT_CLOUD_NODE_TYPES.has(node.type)) {
    return invalidProgress('Cloud workflow steps do not accept generic Agent progress.');
  }

  if (
    parsed.step.progress !== undefined &&
    (node.type !== 'excel.read' ||
      parsed.step.status !== 'running' ||
      parsed.step.processedFileCount > parsed.step.progress.totalWorkbookCount)
  ) {
    return invalidProgress('Workbook batch progress does not match a running local Excel read.');
  }

  const output = parsed.step.output;
  if (output === undefined) return parsed;

  if (parsed.step.status === 'succeeded' && isDirectAiSummaryPredecessor(job, node.id)) {
    return {
      ...parsed,
      step: {
        ...parsed.step,
        output: validateDesktopExcelProfile(output),
      },
    };
  }

  if (parsed.step.status === 'running' && node.type === 'google_drive.visible_download_folder') {
    return {
      ...parsed,
      step: { ...parsed.step, output: VisibleDriveProgressSchema.parse(output) },
    };
  }

  if (parsed.step.status === 'running' && node.type === 'excel.visible_review') {
    return {
      ...parsed,
      step: { ...parsed.step, output: VisibleExcelProgressSchema.parse(output) },
    };
  }

  return invalidProgress('The Agent progress output is not an approved metadata-only payload.');
}

export function validateAgentProgressRequest(job: AgentJob, input: unknown): ProgressJobRequest {
  try {
    return parseAgentProgressRequest(job, input);
  } catch (error) {
    if (error instanceof AgentProtocolError) throw error;
    throw new AgentProtocolError(
      'AGENT_REQUEST_INVALID',
      'The Agent progress payload failed metadata-only validation.',
      { cause: error },
    );
  }
}

export function isAgentCloudNodeType(type: string): type is AgentCloudNode['type'] {
  return AGENT_CLOUD_NODE_TYPES.has(type);
}
