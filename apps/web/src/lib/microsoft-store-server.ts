import 'server-only';

import type { PlanCode } from '@ai-workflow-studio/shared/plans';
import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const StoreIdKeySchema = z
  .string()
  .trim()
  .min(100)
  .max(16_384)
  .regex(/^[A-Za-z0-9._~+/=-]+$/);

const MicrosoftTokenResponseSchema = z
  .object({
    access_token: z.string().min(24).max(16_384),
    expires_in: z.union([z.number().positive(), z.string().regex(/^\d+$/)]).optional(),
    token_type: z.string().min(1).optional(),
  })
  .passthrough();

const MicrosoftSubscriptionSchema = z
  .object({
    autoRenew: z.boolean().optional(),
    expirationTime: z.string().datetime({ offset: true }),
    expirationTimeWithGrace: z.string().datetime({ offset: true }).optional(),
    id: z.string().min(1).max(200),
    isTrial: z.boolean().optional(),
    lastModified: z.string().datetime({ offset: true }),
    market: z.string().min(2).max(10),
    productId: z.string().min(1).max(200),
    recurrenceState: z.enum(['None', 'Active', 'Inactive', 'Canceled', 'InDunning', 'Failed']),
    skuId: z.string().min(1).max(200),
    startTime: z.string().datetime({ offset: true }),
  })
  .passthrough();

const MicrosoftSubscriptionResponseSchema = z
  .object({
    continuationToken: z.string().min(1).max(4_096).optional(),
    items: z.array(MicrosoftSubscriptionSchema).max(100),
  })
  .passthrough();

type StoreSubscription = z.infer<typeof MicrosoftSubscriptionSchema>;
type StoreTransport = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type MicrosoftStoreErrorCode =
  | 'STORE_ACCESS_DENIED'
  | 'STORE_ENTITLEMENT_NOT_CONFIGURED'
  | 'STORE_ENTITLEMENT_RESPONSE_INVALID'
  | 'STORE_ENTITLEMENT_SYNC_FAILED'
  | 'STORE_ID_KEY_INVALID';

export class MicrosoftStoreError extends Error {
  readonly code: MicrosoftStoreErrorCode;

  constructor(code: MicrosoftStoreErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'MicrosoftStoreError';
  }
}

export interface MicrosoftStoreSyncResult {
  readonly entitlementState: 'Active' | 'InDunning' | 'Inactive' | 'Canceled' | 'Failed';
  readonly expiresAt: string;
  readonly plan: PlanCode;
  readonly status: 'trialing' | 'active' | 'past_due' | 'canceled';
  readonly verifiedAt: string;
}

interface StoreServiceConfiguration {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly planMappings: readonly {
    readonly plan: 'pro' | 'team' | 'business';
    readonly productId: string;
    readonly skuId: string;
  }[];
  readonly tenantId: string;
}

function storeServiceConfiguration(): StoreServiceConfiguration {
  const environment = getEnvironment();
  const parsed = z
    .object({
      clientId: z.string().uuid(),
      clientSecret: z.string().min(24),
      tenantId: z.string().uuid(),
    })
    .safeParse({
      clientId: process.env.MICROSOFT_STORE_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_STORE_CLIENT_SECRET,
      tenantId: process.env.MICROSOFT_STORE_TENANT_ID,
    });
  if (!environment.microsoftStore.configured || !parsed.success) {
    throw new MicrosoftStoreError(
      'STORE_ENTITLEMENT_NOT_CONFIGURED',
      'Microsoft Store entitlement verification is not configured.',
    );
  }
  return {
    ...parsed.data,
    planMappings: environment.microsoftStore.planMappings,
  };
}

async function sha256Json(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function responseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 1_000_000) {
    throw new MicrosoftStoreError(
      'STORE_ENTITLEMENT_RESPONSE_INVALID',
      'Microsoft Store returned an oversized response.',
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new MicrosoftStoreError(
      'STORE_ENTITLEMENT_RESPONSE_INVALID',
      'Microsoft Store returned an invalid response.',
      { cause: error },
    );
  }
}

async function querySubscriptions(
  storeIdKey: string,
  configuration: StoreServiceConfiguration,
  transport: StoreTransport,
): Promise<z.infer<typeof MicrosoftSubscriptionResponseSchema>> {
  const tokenBody = new URLSearchParams({
    client_id: configuration.clientId,
    client_secret: configuration.clientSecret,
    grant_type: 'client_credentials',
    resource: 'https://onestore.microsoft.com',
  });
  const tokenResponse = await transport(
    `https://login.microsoftonline.com/${configuration.tenantId}/oauth2/token`,
    {
      body: tokenBody,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    },
  );
  const token = MicrosoftTokenResponseSchema.safeParse(await responseJson(tokenResponse));
  if (!tokenResponse.ok || !token.success) {
    throw new MicrosoftStoreError(
      'STORE_ENTITLEMENT_SYNC_FAILED',
      'Microsoft Store service authentication failed.',
    );
  }

  const subscriptionResponse = await transport(
    'https://purchase.mp.microsoft.com/v8.0/b2b/recurrences/query',
    {
      body: JSON.stringify({ b2bKey: storeIdKey }),
      headers: {
        authorization: `Bearer ${token.data.access_token}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    },
  );
  const subscriptions = MicrosoftSubscriptionResponseSchema.safeParse(
    await responseJson(subscriptionResponse),
  );
  if (!subscriptionResponse.ok || !subscriptions.success) {
    throw new MicrosoftStoreError(
      'STORE_ENTITLEMENT_RESPONSE_INVALID',
      'Microsoft Store entitlement response failed validation.',
    );
  }
  if (subscriptions.data.continuationToken !== undefined) {
    throw new MicrosoftStoreError(
      'STORE_ENTITLEMENT_RESPONSE_INVALID',
      'Microsoft Store returned an incomplete paginated entitlement response.',
    );
  }
  return subscriptions.data;
}

function selectEntitlement(
  items: readonly StoreSubscription[],
  configuration: StoreServiceConfiguration,
  now: Date,
): {
  readonly item: StoreSubscription;
  readonly plan: 'pro' | 'team' | 'business';
} | null {
  const planRank = { business: 3, pro: 1, team: 2 } as const;
  return (
    items
      .flatMap((item) => {
        const mapping = configuration.planMappings.find(
          (candidate) => candidate.productId === item.productId && candidate.skuId === item.skuId,
        );
        if (mapping === undefined) return [];
        const accessUntil = new Date(item.expirationTimeWithGrace ?? item.expirationTime).getTime();
        const entitled =
          (item.recurrenceState === 'Active' || item.recurrenceState === 'InDunning') &&
          accessUntil > now.getTime();
        return entitled ? [{ item, plan: mapping.plan }] : [];
      })
      .sort((left, right) => planRank[right.plan] - planRank[left.plan])[0] ?? null
  );
}

export async function syncMicrosoftStoreEntitlement(
  context: WorkspaceContext,
  rawStoreIdKey: unknown,
  transport: StoreTransport = fetch,
): Promise<MicrosoftStoreSyncResult> {
  if (!['owner', 'admin'].includes(context.actor.role)) {
    throw new MicrosoftStoreError(
      'STORE_ACCESS_DENIED',
      'Workspace owner or administrator access is required.',
    );
  }
  const storeIdKey = StoreIdKeySchema.safeParse(rawStoreIdKey);
  if (!storeIdKey.success) {
    throw new MicrosoftStoreError('STORE_ID_KEY_INVALID', 'The Microsoft Store ID key is invalid.');
  }
  const configuration = storeServiceConfiguration();
  const response = await querySubscriptions(storeIdKey.data, configuration, transport);
  const now = new Date();
  const selection = selectEntitlement(response.items, configuration, now);
  const fallbackExpiration = new Date(now.getTime() + 1_000).toISOString();
  const item =
    selection?.item ??
    ({
      expirationTime: fallbackExpiration,
      id: `none:${context.actor.tenantId}`,
      isTrial: false,
      lastModified: now.toISOString(),
      market: 'ZZ',
      productId: 'none',
      recurrenceState: 'Inactive',
      skuId: 'none',
      startTime: now.toISOString(),
    } satisfies StoreSubscription);
  const plan = selection?.plan ?? 'free';
  const payloadHash = await sha256Json(response);
  const graceExpiresAt = item.expirationTimeWithGrace ?? item.expirationTime;
  const rpc = await createSupabaseAdminClient().rpc('sync_microsoft_store_entitlement', {
    actor_id: context.actor.userId,
    target_entitlement_state: item.recurrenceState === 'None' ? 'Inactive' : item.recurrenceState,
    target_expires_at: item.expirationTime,
    target_external_subscription_id: item.id,
    target_grace_expires_at: graceExpiresAt,
    target_is_trial: item.isTrial ?? false,
    target_market: item.market,
    target_payload_hash: payloadHash,
    target_plan_code: plan,
    target_period_start: item.startTime,
    target_store_product_id: item.productId,
    target_store_sku_id: item.skuId,
    target_tenant_id: context.actor.tenantId,
  });
  if (rpc.error !== null) {
    throw new MicrosoftStoreError(
      'STORE_ENTITLEMENT_SYNC_FAILED',
      'Microsoft Store entitlement could not be synchronized.',
    );
  }

  const entitlementState = item.recurrenceState === 'None' ? 'Inactive' : item.recurrenceState;
  const status =
    entitlementState === 'Active'
      ? item.isTrial === true
        ? 'trialing'
        : 'active'
      : entitlementState === 'InDunning' && new Date(graceExpiresAt) > now
        ? 'past_due'
        : 'canceled';
  return {
    entitlementState,
    expiresAt: graceExpiresAt,
    plan,
    status,
    verifiedAt: now.toISOString(),
  };
}

export const microsoftStoreSchemasForTest = {
  StoreIdKeySchema,
};
