import { z } from 'zod';

export const WebsitePreviewViewportSchema = z.enum(['desktop', 'tablet', 'mobile']);

export const WEBSITE_PREVIEW_VIEWPORTS = {
  desktop: {
    height: 900,
    label: { en: 'Desktop', zhHant: '桌機' },
    width: 1440,
  },
  tablet: {
    height: 1024,
    label: { en: 'Tablet', zhHant: '平板' },
    width: 768,
  },
  mobile: {
    height: 844,
    label: { en: 'Mobile', zhHant: '手機' },
    width: 390,
  },
} as const;

export type WebsitePreviewViewport = z.infer<typeof WebsitePreviewViewportSchema>;

export function websitePreviewUrl(
  projectId: string,
  pageSlug: string,
  version: number,
  refresh: number,
): string {
  return `/api/websites/${encodeURIComponent(projectId)}/preview/${encodeURIComponent(pageSlug)}?version=${version}&refresh=${refresh}`;
}

export const WEBSITE_PREVIEW_HEADERS = {
  'cache-control': 'private, no-store, max-age=0',
  'content-security-policy': [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    "font-src 'none'",
    "script-src 'none'",
    "connect-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; '),
  'content-type': 'text/html; charset=utf-8',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
} as const;
