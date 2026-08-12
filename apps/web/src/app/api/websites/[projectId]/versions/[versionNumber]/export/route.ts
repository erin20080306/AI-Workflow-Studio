import { z } from 'zod';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { exportWebsiteNextApp } from '@/lib/website-nextjs-export-server';
import { exportWebsiteVersion } from '@/lib/website-static-export-server';
import { websiteApiError } from '@/lib/website-studio-api';

const ParamsSchema = z
  .object({
    projectId: z.string().uuid(),
    versionNumber: z.coerce.number().int().min(1),
  })
  .strict();

export async function GET(
  request: Request,
  routeContext: {
    readonly params: Promise<{
      readonly projectId: string;
      readonly versionNumber: string;
    }>;
  },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const context = await requireWorkspaceContext();
    const format = new URL(request.url).searchParams.get('format');
    const result =
      format === 'next-app'
        ? await exportWebsiteNextApp(context, params.projectId, params.versionNumber)
        : await exportWebsiteVersion(context, params.projectId, params.versionNumber);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(result.bytes);
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': `attachment; filename="${result.filename}"`,
        'content-length': String(result.bytes.byteLength),
        'content-type': 'application/zip',
        digest: `sha-256=${Buffer.from(result.archiveSha256, 'hex').toString('base64')}`,
        'x-content-sha256': result.archiveSha256,
        'x-content-type-options': 'nosniff',
      },
      status: 200,
    });
  } catch (error) {
    return websiteApiError(error);
  }
}

export const runtime = 'nodejs';
