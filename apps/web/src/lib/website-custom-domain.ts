import { WebsiteDnsRecordSchema, type WebsiteDnsRecord } from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

export const WEBSITE_PLATFORM_APEX = 'erin-aiworkflowstudio.com';
export const WEBSITE_PLATFORM_WILDCARD_SUFFIX = 'sites.erin-aiworkflowstudio.com';
export const WEBSITE_CUSTOM_HOST_HEADER = 'x-ai-workflow-custom-site-host';

const HostnameSchema = z
  .string()
  .min(4)
  .max(253)
  .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);

function isIpv4(value: string): boolean {
  const octets = value.split('.');
  return (
    octets.length === 4 &&
    octets.every((octet) => /^(?:0|[1-9][0-9]{0,2})$/u.test(octet) && Number(octet) <= 255)
  );
}

function isReservedHostname(hostname: string): boolean {
  return (
    hostname === WEBSITE_PLATFORM_APEX ||
    hostname.endsWith(`.${WEBSITE_PLATFORM_APEX}`) ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.example') ||
    hostname.endsWith('.invalid') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.vercel.app')
  );
}

export function normalizeCustomerHostname(value: string): string {
  const hostname = value.trim().toLowerCase().replace(/\.$/u, '');
  if (
    hostname.includes('://') ||
    hostname.includes('/') ||
    hostname.includes(':') ||
    hostname.includes('*') ||
    hostname.includes(' ')
  ) {
    throw new Error('CUSTOM_DOMAIN_INVALID');
  }
  const parsed = HostnameSchema.safeParse(hostname);
  const labels = hostname.split('.');
  if (
    !parsed.success ||
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 || label.length > 63 || label.startsWith('-') || label.endsWith('-'),
    ) ||
    isIpv4(hostname) ||
    isReservedHostname(hostname)
  ) {
    throw new Error('CUSTOM_DOMAIN_INVALID');
  }
  return parsed.data;
}

export function customerHostnameFromHost(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const first = value.split(',')[0]?.trim() ?? '';
  const withoutPort = first.replace(/:\d+$/u, '');
  try {
    return normalizeCustomerHostname(withoutPort);
  } catch {
    return undefined;
  }
}

export function websiteCustomDomainRewritePath(
  hostnameValue: string,
  pathnameValue: string,
): string {
  const hostname = normalizeCustomerHostname(hostnameValue);
  const pathname = pathnameValue.startsWith('/') ? pathnameValue : `/${pathnameValue}`;
  return `/d/${hostname}${pathname === '/' ? '' : pathname}`;
}

export function websiteCustomDomainUrl(hostnameValue: string): string {
  return `https://${normalizeCustomerHostname(hostnameValue)}`;
}

export function buildRoutingDnsRecord(input: {
  readonly apexName: string;
  readonly hostname: string;
  readonly recommendedCname?: string;
  readonly recommendedIpv4?: string;
}): WebsiteDnsRecord {
  const hostname = normalizeCustomerHostname(input.hostname);
  const apexName = normalizeCustomerHostname(input.apexName);
  return WebsiteDnsRecordSchema.parse(
    hostname === apexName
      ? {
          name: hostname,
          purpose: 'routing',
          type: 'A',
          value: input.recommendedIpv4 ?? '76.76.21.21',
        }
      : {
          name: hostname,
          purpose: 'routing',
          type: 'CNAME',
          value: input.recommendedCname ?? 'cname.vercel-dns-0.com',
        },
  );
}

export function isAnyPublishedWebsiteAssetPath(pathname: string): boolean {
  return /^\/api\/public-sites\/[a-z0-9]+(?:-[a-z0-9]+)*\/assets\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(
    pathname,
  );
}
