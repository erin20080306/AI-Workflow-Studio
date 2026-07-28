import 'server-only';

import { WebsiteDnsRecordSchema, type WebsiteDnsRecord } from '@ai-workflow-studio/website-schema';
import { z } from 'zod';

import { getEnvironment } from '@/lib/env';
import { buildRoutingDnsRecord, normalizeCustomerHostname } from '@/lib/website-custom-domain';

const VercelVerificationSchema = z
  .object({
    domain: z.string().trim().min(1).max(253),
    type: z.literal('TXT'),
    value: z.string().trim().min(1).max(1_024),
  })
  .passthrough();

const VercelProjectDomainSchema = z
  .object({
    apexName: z.string().trim().min(4).max(253),
    name: z.string().trim().min(4).max(253),
    verification: z.array(VercelVerificationSchema).max(3).optional(),
    verified: z.boolean(),
  })
  .passthrough();

const RecommendationValueSchema = z.union([
  z.string().trim().min(1).max(253),
  z
    .object({
      value: z.string().trim().min(1).max(253),
    })
    .passthrough(),
]);
const RecommendationSchema = z.union([
  RecommendationValueSchema,
  z.array(RecommendationValueSchema).max(10),
]);

const VercelDomainConfigurationSchema = z
  .object({
    misconfigured: z.boolean(),
    recommendedCNAME: RecommendationSchema.optional(),
    recommendedIPv4: RecommendationSchema.optional(),
  })
  .passthrough();

const VercelErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().max(120).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export class VercelCustomDomainError extends Error {
  readonly code: 'PROVIDER_NOT_CONFIGURED' | 'PROVIDER_REJECTED' | 'PROVIDER_UNAVAILABLE';

  constructor(
    code: 'PROVIDER_NOT_CONFIGURED' | 'PROVIDER_REJECTED' | 'PROVIDER_UNAVAILABLE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.name = 'VercelCustomDomainError';
  }
}

export interface VercelDomainState {
  readonly dnsRecords: readonly WebsiteDnsRecord[];
  readonly hostname: string;
  readonly ownershipVerified: boolean;
  readonly routingVerified: boolean;
}

interface VercelConfiguration {
  readonly projectId: string;
  readonly teamId?: string;
  readonly token: string;
}

type Fetcher = typeof fetch;

function configuration(): VercelConfiguration {
  const value = getEnvironment().vercelCustomDomains;
  if (!value.configured || value.projectId === undefined || value.token === undefined) {
    throw new VercelCustomDomainError(
      'PROVIDER_NOT_CONFIGURED',
      'Customer custom domains are not configured.',
    );
  }
  return {
    projectId: value.projectId,
    ...(value.teamId === undefined ? {} : { teamId: value.teamId }),
    token: value.token,
  };
}

function firstRecommendation(
  value: z.infer<typeof RecommendationSchema> | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const item = Array.isArray(value) ? value[0] : value;
  return typeof item === 'string' ? item : item?.value;
}

function providerUrl(path: string, providerConfiguration: VercelConfiguration): string {
  const url = new URL(path, 'https://api.vercel.com');
  if (providerConfiguration.teamId !== undefined) {
    url.searchParams.set('teamId', providerConfiguration.teamId);
  }
  return url.toString();
}

async function providerRequest(
  path: string,
  providerConfiguration: VercelConfiguration,
  fetcher: Fetcher,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(providerUrl(path, providerConfiguration), {
      ...init,
      headers: {
        authorization: `Bearer ${providerConfiguration.token}`,
        'content-type': 'application/json',
        ...init?.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new VercelCustomDomainError(
      'PROVIDER_UNAVAILABLE',
      'The domain provider could not be reached.',
      { cause: error },
    );
  }
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerCode = VercelErrorSchema.safeParse(payload);
    throw new VercelCustomDomainError(
      'PROVIDER_REJECTED',
      providerCode.success && providerCode.data.error.code === 'forbidden'
        ? 'The domain provider requires ownership verification or additional access.'
        : 'The domain provider rejected the request.',
    );
  }
  return payload;
}

function ownershipRecords(
  domain: z.infer<typeof VercelProjectDomainSchema>,
): readonly WebsiteDnsRecord[] {
  return (domain.verification ?? []).map((record) =>
    WebsiteDnsRecordSchema.parse({
      name: record.domain,
      purpose: 'ownership',
      type: record.type,
      value: record.value,
    }),
  );
}

async function readDomainState(
  domainValue: unknown,
  providerConfiguration: VercelConfiguration,
  fetcher: Fetcher,
): Promise<VercelDomainState> {
  const parsedDomain = VercelProjectDomainSchema.safeParse(domainValue);
  if (!parsedDomain.success) {
    throw new VercelCustomDomainError(
      'PROVIDER_UNAVAILABLE',
      'The domain provider returned an invalid domain response.',
    );
  }
  const domain = parsedDomain.data;
  let hostname: string;
  try {
    hostname = normalizeCustomerHostname(domain.name);
  } catch {
    throw new VercelCustomDomainError(
      'PROVIDER_UNAVAILABLE',
      'The domain provider returned an invalid hostname.',
    );
  }
  const configValue = await providerRequest(
    `/v6/domains/${encodeURIComponent(hostname)}/config`,
    providerConfiguration,
    fetcher,
  );
  const parsedConfiguration = VercelDomainConfigurationSchema.safeParse(configValue);
  if (!parsedConfiguration.success) {
    throw new VercelCustomDomainError(
      'PROVIDER_UNAVAILABLE',
      'The domain provider returned an invalid routing response.',
    );
  }
  const config = parsedConfiguration.data;
  const recommendedCname = firstRecommendation(config.recommendedCNAME);
  const recommendedIpv4 = firstRecommendation(config.recommendedIPv4);
  const routingRecord = buildRoutingDnsRecord({
    apexName: domain.apexName,
    hostname,
    ...(recommendedCname === undefined ? {} : { recommendedCname }),
    ...(recommendedIpv4 === undefined ? {} : { recommendedIpv4 }),
  });
  return {
    dnsRecords: [...ownershipRecords(domain), routingRecord],
    hostname,
    ownershipVerified: domain.verified,
    routingVerified: !config.misconfigured,
  };
}

export async function addVercelProjectDomain(
  hostnameValue: string,
  fetcher: Fetcher = fetch,
): Promise<VercelDomainState> {
  const hostname = normalizeCustomerHostname(hostnameValue);
  const providerConfiguration = configuration();
  let result: unknown;
  try {
    result = await providerRequest(
      `/v10/projects/${encodeURIComponent(providerConfiguration.projectId)}/domains`,
      providerConfiguration,
      fetcher,
      {
        body: JSON.stringify({ name: hostname }),
        method: 'POST',
      },
    );
  } catch (error) {
    if (!(error instanceof VercelCustomDomainError) || error.code !== 'PROVIDER_REJECTED') {
      throw error;
    }
    result = await providerRequest(
      `/v9/projects/${encodeURIComponent(
        providerConfiguration.projectId,
      )}/domains/${encodeURIComponent(hostname)}`,
      providerConfiguration,
      fetcher,
    );
  }
  return readDomainState(result, providerConfiguration, fetcher);
}

export async function verifyVercelProjectDomain(
  hostnameValue: string,
  fetcher: Fetcher = fetch,
): Promise<VercelDomainState> {
  const hostname = normalizeCustomerHostname(hostnameValue);
  const providerConfiguration = configuration();
  const result = await providerRequest(
    `/v9/projects/${encodeURIComponent(providerConfiguration.projectId)}/domains/${encodeURIComponent(
      hostname,
    )}/verify`,
    providerConfiguration,
    fetcher,
    { method: 'POST' },
  );
  return readDomainState(result, providerConfiguration, fetcher);
}
