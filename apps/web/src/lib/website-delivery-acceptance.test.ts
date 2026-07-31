import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceContext } from './auth/context';
import {
  consumeMeteredAllowance,
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

  it('keeps platform-admin acceptance available after tenant allowances are exhausted', async () => {
    const adminContext: WorkspaceContext = {
      ...context,
      actor: {
        ...context.actor,
        tenantId: '10000000-0000-4000-8000-000000004103',
      },
      platformAdmin: true,
      tenant: {
        ...context.tenant,
        id: '10000000-0000-4000-8000-000000004103',
      },
    };
    const usageGlobal = globalThis as typeof globalThis & {
      __aiWorkflowUsageState?: {
        records: {
          costMicrounits: number;
          inputUnits: number;
          operation: string;
          provider: string;
          tenantId: string;
        }[];
        requestTimes: { createdAt: number; tenantId: string }[];
        reservations: Map<string, { costMicrounits: number; createdAt: number; tenantId: string }>;
      };
    };
    usageGlobal.__aiWorkflowUsageState ??= {
      records: [],
      requestTimes: [],
      reservations: new Map(),
    };
    usageGlobal.__aiWorkflowUsageState.records.push(
      {
        costMicrounits: 2_000_000_000,
        inputUnits: 1,
        operation: 'chat',
        provider: 'openai',
        tenantId: adminContext.actor.tenantId,
      },
      {
        costMicrounits: 0,
        inputUnits: 60_000_000_000,
        operation: 'source_upload',
        provider: 'platform',
        tenantId: adminContext.actor.tenantId,
      },
    );

    const exhausted = await getTenantUsageSnapshot(adminContext);
    expect(exhausted.ai.level).toBe('blocked');
    expect(exhausted.source.usedBytes).toBeGreaterThan(exhausted.source.limitBytes);

    const reservation = await reserveAssistantUsage(adminContext, {
      inputCharacters: 120,
      maxAttempts: 1,
      maxOutputTokens: 200,
      operation: 'workflow_plan',
      provider: 'openai',
    });
    await consumeMeteredAllowance(adminContext, 'source_upload', 10, {
      acceptance: 'platform-admin',
    });
    await reservation.release();
  });
});
