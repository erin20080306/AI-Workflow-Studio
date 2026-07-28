import { z } from 'zod';

export const WEBSITE_SITE_HOST_SUFFIX = 'sites.erin-aiworkflowstudio.com';
export const WEBSITE_SITE_HOST_HEADER = 'x-ai-workflow-site-slug';

export const WEBSITE_SITE_SLUG_RESERVED = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'cdn',
  'dashboard',
  'docs',
  'help',
  'login',
  'mail',
  'register',
  'sites',
  'static',
  'status',
  'support',
  'www',
]);

const WebsiteSiteSlugSchema = z
  .string()
  .min(3)
  .max(63)
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

export function normalizeWebsiteSiteSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/gu, '-')
    .replace(/[^a-z0-9-]/gu, '')
    .replace(/-{2,}/gu, '-')
    .replace(/^-|-$/gu, '');
  const parsed = WebsiteSiteSlugSchema.safeParse(normalized);
  if (!parsed.success || WEBSITE_SITE_SLUG_RESERVED.has(parsed.data)) {
    throw new Error('WEBSITE_SITE_SLUG_INVALID');
  }
  return parsed.data;
}

export function defaultWebsiteSiteSlug(projectSlug: string, projectId: string): string {
  const idSuffix = projectId.replaceAll('-', '').slice(0, 8).toLowerCase();
  const normalizedProjectSlug = projectSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^-|-$/gu, '');
  const prefix = normalizedProjectSlug.slice(0, 39).replace(/-$/u, '') || 'site';
  return normalizeWebsiteSiteSlug(`${prefix}-${idSuffix}`);
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
  const siteSlug = normalizeWebsiteSiteSlug(siteSlugValue);
  return `https://${siteSlug}.${WEBSITE_SITE_HOST_SUFFIX}`;
}

export function websiteSiteRewritePath(siteSlugValue: string, pathnameValue: string): string {
  const siteSlug = normalizeWebsiteSiteSlug(siteSlugValue);
  const pathname = pathnameValue.startsWith('/') ? pathnameValue : `/${pathnameValue}`;
  const existingPrefix = `/s/${siteSlug}`;
  const sitePath =
    pathname === existingPrefix || pathname.startsWith(`${existingPrefix}/`)
      ? pathname.slice(existingPrefix.length)
      : pathname;
  return `${existingPrefix}${sitePath === '/' ? '' : sitePath}`;
}

export function isPublishedWebsiteAssetPath(pathname: string, siteSlugValue: string): boolean {
  const siteSlug = normalizeWebsiteSiteSlug(siteSlugValue);
  return pathname.startsWith(`/api/public-sites/${siteSlug}/assets/`);
}
