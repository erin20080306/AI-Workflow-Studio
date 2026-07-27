import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceContext } from '@/lib/auth/context';

const environment = {
  appUrl: 'https://app.example.test',
  googleConfigured: false,
  microsoftStore: {
    configured: true,
    planMappings: [
      { plan: 'pro' as const, productId: '9PRO', skuId: 'monthly' },
      { plan: 'business' as const, productId: '9BUSINESS', skuId: 'monthly' },
    ],
  },
  mockMode: false,
  providerModels: {
    anthropic: 'claude',
    gemini: 'gemini',
    mock: 'mock',
    openai: 'openai',
  },
  providers: { anthropic: false, gemini: false, openai: false },
  supabaseConfigured: true,
};

const rpc = vi.fn(async () => ({ data: {}, error: null }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  getEnvironment: () => environment,
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));

const context: WorkspaceContext = {
  actor: {
    role: 'owner',
    tenantId: '10000000-0000-4000-8000-000000000701',
    userId: '10000000-0000-4000-8000-000000000702',
  },
  displayName: 'Owner',
  platformAdmin: false,
  subscription: { plan: 'free', status: 'active' },
  tenant: {
    id: '10000000-0000-4000-8000-000000000701',
    name: 'Tenant',
    slug: 'tenant',
  },
};

describe('Microsoft Store entitlement sync', () => {
  afterEach(() => {
    rpc.mockClear();
    vi.unstubAllEnvs();
  });

  it('exchanges the Store ID key server-side and grants the highest mapped entitlement', async () => {
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', '11111111-1111-4111-8111-111111111111');
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', 'server-secret-with-safe-length');
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', '22222222-2222-4222-8222-222222222222');
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'a'.repeat(30) }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                expirationTime: '2099-08-01T00:00:00.000Z',
                id: 'subscription-pro',
                lastModified: '2026-07-27T00:00:00.000Z',
                market: 'TW',
                productId: '9PRO',
                recurrenceState: 'Active',
                skuId: 'monthly',
                startTime: '2026-07-01T00:00:00.000Z',
              },
              {
                expirationTime: '2099-08-01T00:00:00.000Z',
                id: 'subscription-business',
                lastModified: '2026-07-27T00:00:00.000Z',
                market: 'TW',
                productId: '9BUSINESS',
                recurrenceState: 'Active',
                skuId: 'monthly',
                startTime: '2026-07-01T00:00:00.000Z',
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const { syncMicrosoftStoreEntitlement } = await import('./microsoft-store-server');
    const result = await syncMicrosoftStoreEntitlement(context, 'x'.repeat(120), transport);

    expect(result).toMatchObject({ plan: 'business', status: 'active' });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith(
      'sync_microsoft_store_entitlement',
      expect.objectContaining({
        target_store_product_id: '9BUSINESS',
        target_plan_code: 'business',
      }),
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('x'.repeat(120));
  });

  it('fails closed for malformed Store ID keys before making a network request', async () => {
    const transport = vi.fn();
    const { syncMicrosoftStoreEntitlement } = await import('./microsoft-store-server');
    await expect(syncMicrosoftStoreEntitlement(context, 'short', transport)).rejects.toMatchObject({
      code: 'STORE_ID_KEY_INVALID',
    });
    expect(transport).not.toHaveBeenCalled();
  });
});
