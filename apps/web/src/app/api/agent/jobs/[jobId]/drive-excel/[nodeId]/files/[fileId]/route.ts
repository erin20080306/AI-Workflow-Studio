import { GoogleDriveExcelClient } from '@ai-workflow-studio/google-sheets';

import { agentApiError } from '@/lib/agent-api';
import { authorizeDriveDownloadNode, driveTransferNodeHash } from '@/lib/agent-drive-transfer';
import { verifyAgentDriveTransferToken } from '@/lib/agent-drive-transfer-token';
import { googleConnectionService } from '@/lib/google-connections';

const DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(
  request: Request,
  context: {
    readonly params: Promise<{
      readonly fileId: string;
      readonly jobId: string;
      readonly nodeId: string;
    }>;
  },
): Promise<Response> {
  try {
    const { fileId, jobId, nodeId } = await context.params;
    const { job, node } = await authorizeDriveDownloadNode(request, jobId, nodeId);
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const scope = verifyAgentDriveTransferToken(token, {
      fileId,
      jobId,
      nodeIdHash: driveTransferNodeHash(nodeId),
    });
    await googleConnectionService().assertScopes(job.tenantId, node.config.connectionId, [
      DRIVE_READ_SCOPE,
    ]);
    const accessToken = await googleConnectionService().accessToken(
      job.tenantId,
      node.config.connectionId,
      request.signal,
    );
    const result = await new GoogleDriveExcelClient().downloadExcelManifestFile(
      accessToken,
      {
        id: scope.fileId,
        mimeType: scope.mimeType === 'google_sheet' ? GOOGLE_SHEET_MIME : XLSX_MIME,
        name: 'workbook.xlsx',
        ...(scope.size === undefined ? {} : { size: scope.size }),
      },
      node.config.maxFileSizeBytes,
      request.signal,
    );
    const body = result.bytes.slice().buffer as ArrayBuffer;
    return new Response(body, {
      headers: {
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`,
        'content-length': String(result.bytes.byteLength),
        'content-type': result.mimeType,
      },
    });
  } catch (error) {
    return agentApiError(error);
  }
}

export const runtime = 'nodejs';
