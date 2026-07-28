import { z } from 'zod';

import { getPublishedWebsiteAsset } from '@/lib/website-asset-server';
import { getPublishedWebsiteBySlug } from '@/lib/website-publication-server';

const ParamsSchema = z
  .object({
    assetId: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
    siteSlug: z
      .string()
      .min(3)
      .max(96)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

export async function GET(
  _request: Request,
  routeContext: {
    readonly params: Promise<{ readonly assetId: string; readonly siteSlug: string }>;
  },
): Promise<Response> {
  try {
    const params = ParamsSchema.parse(await routeContext.params);
    const website = await getPublishedWebsiteBySlug(params.siteSlug);
    const referenced = website?.spec.assets.some(
      (asset) => asset.id === params.assetId && asset.kind === 'project-asset',
    );
    if (website === undefined || referenced !== true) {
      return new Response('Not found.', { status: 404 });
    }
    const asset = await getPublishedWebsiteAsset(
      website.tenantId,
      website.projectId,
      params.assetId,
    );
    if (asset === undefined) return new Response('Not found.', { status: 404 });
    return new Response(Buffer.from(asset.bytes), {
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-security-policy': "default-src 'none'",
        'content-type': asset.mimeType,
        'x-content-type-options': 'nosniff',
      },
      status: 200,
    });
  } catch {
    return new Response('Not found.', { status: 404 });
  }
}

export const runtime = 'nodejs';
