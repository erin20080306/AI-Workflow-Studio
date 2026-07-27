import 'server-only';

import { WebsiteStudioError } from '@/lib/website-studio-server';
import { z } from 'zod';

const statusByCode: Readonly<Record<WebsiteStudioError['code'], number>> = {
  WEBSITE_FORBIDDEN: 403,
  WEBSITE_INVALID: 400,
  WEBSITE_NOT_FOUND: 404,
  WEBSITE_STATE_CONFLICT: 409,
};

export async function readWebsiteJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > 32_000) {
    throw new WebsiteStudioError('WEBSITE_INVALID', 'The website request is too large.');
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 32_000) {
    throw new WebsiteStudioError('WEBSITE_INVALID', 'The website request is too large.');
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new WebsiteStudioError('WEBSITE_INVALID', 'The website request must contain JSON.');
  }
}

export function websiteApiError(error: unknown): Response {
  const safe =
    error instanceof WebsiteStudioError
      ? error
      : error instanceof z.ZodError
        ? new WebsiteStudioError('WEBSITE_INVALID', 'The website request is invalid.')
        : new WebsiteStudioError(
            'WEBSITE_STATE_CONFLICT',
            'The website request could not be completed.',
          );
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    {
      headers: { 'cache-control': 'no-store' },
      status: statusByCode[safe.code],
    },
  );
}
