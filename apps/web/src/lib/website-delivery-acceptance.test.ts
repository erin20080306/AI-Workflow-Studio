import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceContext } from './auth/context';
import {
  getTenantUsageSnapshot,
  recordReservedAssistantUsage,
  reserveAssistantUsage,
} from './usage-control-server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  getEnvironment: () => ({ mockMode: true }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('Production storage must not be used by the acceptance fixture.');
  },
}));

const context: WorkspaceContext = {
  actor: {
    role: 'owner',
    tenantId: '10000000-0000-4000-8000-000000004101',
    userId: '10000000-0000-4000-8000-000000004102',
  },
  displayName: 'Website acceptance owner',
  email: 'website-acceptance@example.invalid',
  platformAdmin: false,
  subscription: {
    plan: 'pro',
    status: 'active',
  },
  tenant: {
    id: '10000000-0000-4000-8000-000000004101',
    name: 'Website acceptance workspace',
    slug: 'website-acceptance',
  },
};

describe('website delivery usage acceptance', () => {
  it('reserves, records, and settles metered website AI work', async () => {
    const before = await getTenantUsageSnapshot(context);
    const reservation = await reserveAssistantUsage(context, {
      inputCharacters: 120,
      maxAttempts: 1,
      maxOutputTokens: 200,
      operation: 'website_generation',
      provider: 'gemini',
    });
    const reserved = await getTenantUsageSnapshot(context);

    expect(reserved.ai.reservedMicrounits).toBe(reservation.maximumCostMicrounits);
    expect(reserved.ai.remainingMicrounits).toBeLessThan(before.ai.remainingMicrounits);

    await recordReservedAssistantUsage(context, reservation, 'website-acceptance-project', {
      attempt: 1,
      durationMs: 320,
      inputTokens: 40,
      model: 'gemini-3.5-flash-lite',
      operation: 'website_generation',
      outcome: 'succeeded',
      outputTokens: 80,
      provider: 'gemini',
      validationCodes: [],
    });
    await reservation.release();

    const settled = await getTenantUsageSnapshot(context);
    expect(settled.ai.reservedMicrounits).toBe(0);
    expect(settled.ai.usedMicrounits).toBeGreaterThan(before.ai.usedMicrounits);
    expect(settled.providerCosts).toContainEqual({
      costMicrounits: settled.ai.usedMicrounits - before.ai.usedMicrounits,
      provider: 'gemini',
    });
  });
});
