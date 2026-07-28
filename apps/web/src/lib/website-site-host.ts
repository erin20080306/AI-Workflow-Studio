import { z } from 'zod';

export const WEBSITE_SITE_HOST_SUFFIX = 'sites.erin-aiworkflowstudio.com';
export const WEBSITE_SITE_HOST_HEADER = 'x-ai-workflow-site-slug';

const WebsiteSiteSlugSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function firstForwardedHost(value: string): string {
  return value.split(',')[0]?.trim() ?? '';
}

function normalizeHostname(value: string): string {
  const candidate = firstForwardedHost(value).toLowerCase().replace(/\.$/u, '');
  const portIndex = candidate.lastIndexOf(':');
  if (portIndex > 0 && /^[0-9]+$/u.test(candidate.slice(portIndex + 1))) {
    return candidate.slice(0, portIndex);
  }
  return candidate;
}

export function websiteSiteSlugFromHost(
  hostValue: string | null | undefined,
  suffix = WEBSITE_SITE_HOST_SUFFIX,
): string | undefined {
  if (hostValue === null || hostValue === undefined) return undefined;
  const hostname = normalizeHostname(hostValue);
  const normalizedSuffix = normalizeHostname(suffix);
  const ending = `.${normalizedSuffix}`;
  if (!hostname.endsWith(ending)) return undefined;
  const label = hostname.slice(0, -ending.length);
  const parsed = WebsiteSiteSlugSchema.safeParse(label);
  return parsed.success ? parsed.data : undefined;
}

export function websiteSiteUrl(siteSlugValue: string): string {
  const siteSlug = WebsiteSiteSlugSchema.parse(siteSlugValue);
  return `https://${siteSlug}.${WEBSITE_SITE_HOST_SUFFIX}`;
}

export function websiteSiteRewritePath(siteSlugValue: string, pathnameValue: string): string {
  const siteSlug = WebsiteSiteSlugSchema.parse(siteSlugValue);
  const pathname = pathnameValue.startsWith('/') ? pathnameValue : `/${pathnameValue}`;
  const existingPrefix = `/s/${siteSlug}`;
  const sitePath =
    pathname === existingPrefix || pathname.startsWith(`${existingPrefix}/`)
      ? pathname.slice(existingPrefix.length)
      : pathname;
  return `${existingPrefix}${sitePath === '/' ? '' : sitePath}`;
}

export function isPublishedWebsiteAssetPath(pathname: string, siteSlugValue: string): boolean {
  const siteSlug = WebsiteSiteSlugSchema.parse(siteSlugValue);
  return pathname.startsWith(`/api/public-sites/${siteSlug}/assets/`);
}
