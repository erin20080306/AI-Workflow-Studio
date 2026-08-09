import { GoogleDriveExcelClient } from '@ai-workflow-studio/google-sheets';
import { AgentProtocolError } from '@ai-workflow-studio/agent-protocol';

import { agentApiError } from '@/lib/agent-api';
import {
  authorizeDriveDownloadNode,
  driveTransferNodeHash,
  safeTransferredWorkbookName,
} from '@/lib/agent-drive-transfer';
import { createAgentDriveTransferToken } from '@/lib/agent-drive-transfer-token';
import { googleConnectionService } from '@/lib/google-connections';

const DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const XLS_MIME = 'application/vnd.ms-excel';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(
  request: Request,
  context: {
    readonly params: Promise<{ readonly jobId: string; readonly nodeId: string }>;
  },
): Promise<Response> {
  try {
    const { jobId, nodeId } = await context.params;
    const { job, node } = await authorizeDriveDownloadNode(request, jobId, nodeId);
    await googleConnectionService().assertScopes(job.tenantId, node.config.connectionId, [
      DRIVE_READ_SCOPE,
    ]);
    const accessToken = await googleConnectionService().accessToken(
      job.tenantId,
      node.config.connectionId,
      request.signal,
    );
    const manifest = await new GoogleDriveExcelClient().discoverExcelFolder(
      accessToken,
      node.config.folderId,
      {
        headerScanRows: 30,
        includeSubfolders: node.config.includeSubfolders,
        maxFileSizeBytes: node.config.maxFileSizeBytes,
        maxFiles: node.config.maxFiles,
        maxRows: 100_000,
        maxSheets: 2_000,
      },
      request.signal,
    );
    const expiresAt = Date.now() + 10 * 60_000;
    const nodeIdHash = driveTransferNodeHash(nodeId);
    const files = manifest.files.flatMap((file) => {
      const isGoogleSheet = file.mimeType === GOOGLE_SHEET_MIME;
      const isXls = file.mimeType === XLS_MIME || file.name.toLowerCase().endsWith('.xls');
      const isXlsx = file.mimeType === XLSX_MIME || file.name.toLowerCase().endsWith('.xlsx');
      if (!isGoogleSheet && !isXls && !isXlsx) return [];
      const sourceName = isXls && !/\.xls$/iu.test(file.name) ? `${file.name}.xls` : file.name;
      const fileName = safeTransferredWorkbookName(sourceName);
      const mimeType = isGoogleSheet
        ? ('google_sheet' as const)
        : isXls
          ? ('xls' as const)
          : ('xlsx' as const);
      return [
        {
          downloadToken: createAgentDriveTransferToken({
            expiresAt,
            fileId: file.id,
            jobId,
            mimeType,
            nodeIdHash,
            ...(file.size === undefined ? {} : { size: file.size }),
          }),
          fileId: file.id,
          fileName,
          mimeType,
          ...(file.size === undefined ? {} : { size: file.size }),
        },
      ];
    });
    if (files.length === 0) {
      throw new AgentProtocolError(
        'AGENT_REQUEST_INVALID',
        'The Drive folder contains no workbooks supported by Desktop transfer.',
      );
    }
    return Response.json(
      {
        expiresAt: new Date(expiresAt).toISOString(),
        files,
        folderId: manifest.folderId,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return agentApiError(error);
  }
}

export const runtime = 'nodejs';
