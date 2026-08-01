import 'server-only';

import { createHash } from 'node:crypto';

import { AgentProtocolError, type AgentJob } from '@ai-workflow-studio/agent-protocol';

import { claimedJobCredentials } from './agent-api';
import { getAgentServerState } from './agent-server';

export type DriveDownloadNode = Extract<
  AgentJob['workflow']['nodes'][number],
  { readonly type: 'google_drive.download_excel_folder' }
>;

export function driveTransferNodeHash(nodeId: string): string {
  return createHash('sha256').update(nodeId).digest('hex');
}

export async function authorizeDriveDownloadNode(
  request: Request,
  jobId: string,
  nodeId: string,
): Promise<{ readonly job: AgentJob; readonly node: DriveDownloadNode }> {
  const job = await getAgentServerState().service.renewLease(
    claimedJobCredentials(request),
    jobId,
    { leaseSeconds: 120 },
  );
  const node = job.workflow.nodes.find(
    (candidate): candidate is DriveDownloadNode =>
      candidate.id === nodeId && candidate.type === 'google_drive.download_excel_folder',
  );
  if (node === undefined) {
    throw new AgentProtocolError(
      'AGENT_FORBIDDEN',
      'The claimed job does not authorize this Drive transfer.',
    );
  }
  return { job, node };
}

export function safeTransferredWorkbookName(input: string): string {
  let normalized = input
    .normalize('NFKC')
    .replace(/[\p{Cc}<>"/\\|?*:]/gu, '_')
    .replace(/\.xlsx$/iu, '')
    .trim()
    .replace(/[. ]+$/u, '')
    .slice(0, 180);
  if (/^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])$/iu.test(normalized)) {
    normalized = `${normalized}_`;
  }
  return `${normalized || 'workbook'}.xlsx`;
}
