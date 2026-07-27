import 'server-only';

import type { UsageRecord } from '@ai-workflow-studio/ai-gateway';
import {
  canReserveUsage,
  estimateAiCostMicrounits,
  estimateMaximumAiCostMicrounits,
  evaluateUsageBudget,
  getProductPlan,
  INTERNAL_RATE_CARD_VERSION,
  type UsageBudgetLevel,
  type UsageOperation,
  type UsageProvider,
} from '@ai-workflow-studio/usage-control';
import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const UsageRowSchema = z.object({
  cost_microunits: z.number().int().nonnegative(),
  input_units: z.number().int().nonnegative(),
  operation: z.string(),
  provider: z.string(),
});

const ReservationRowSchema = z.object({
  maximum_cost_microunits: z.number().int().nonnegative(),
});

const SubscriptionPeriodSchema = z.object({
  current_period_end: z.string().datetime({ offset: true }),
  current_period_start: z.string().datetime({ offset: true }),
});

interface MemoryUsageState {
  readonly requestTimes: {
    readonly createdAt: number;
    readonly tenantId: string;
  }[];
  readonly records: {
    readonly costMicrounits: number;
    readonly inputUnits: number;
    readonly operation: string;
    readonly provider: string;
    readonly tenantId: string;
  }[];
  readonly reservations: Map<
    string,
    {
      readonly costMicrounits: number;
      readonly createdAt: number;
      readonly tenantId: string;
    }
  >;
}

const usageGlobal = globalThis as typeof globalThis & {
  __aiWorkflowUsageState?: MemoryUsageState;
};

function memoryUsageState(): MemoryUsageState {
  usageGlobal.__aiWorkflowUsageState ??= {
    records: [],
    requestTimes: [],
    reservations: new Map(),
  };
  return usageGlobal.__aiWorkflowUsageState;
}

export type UsageControlErrorCode =
  | 'USAGE_ALLOWANCE_EXCEEDED'
  | 'USAGE_BUDGET_EXCEEDED'
  | 'USAGE_DATA_INVALID'
  | 'USAGE_RATE_LIMIT_EXCEEDED'
  | 'USAGE_REQUEST_COST_EXCEEDED';

export class UsageControlError extends Error {
  readonly code: UsageControlErrorCode;

  constructor(code: UsageControlErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'UsageControlError';
  }
}

export interface TenantUsageSnapshot {
  readonly ai: {
    readonly budgetMicrounits: number;
    readonly level: UsageBudgetLevel;
    readonly percentUsed: number;
    readonly remainingMicrounits: number;
    readonly reservedMicrounits: number;
    readonly usedMicrounits: number;
  };
  readonly periodEnd: string;
  readonly periodStart: string;
  readonly plan: WorkspaceContext['subscription']['plan'];
  readonly providerCosts: readonly {
    readonly costMicrounits: number;
    readonly provider: string;
  }[];
  readonly source: {
    readonly limitBytes: number;
    readonly usedBytes: number;
  };
  readonly toolCalls: {
    readonly limit: number;
    readonly used: number;
  };
}

export interface AssistantUsageReservation {
  readonly costMultiplier: number;
  readonly id: string;
  readonly maximumCostMicrounits: number;
  release(): Promise<void>;
}

function effectivePlanCode(context: WorkspaceContext): WorkspaceContext['subscription']['plan'] {
  return ['active', 'past_due', 'trialing'].includes(context.subscription.status)
    ? context.subscription.plan
    : 'free';
}

function monthPeriod(now = new Date()): { readonly end: string; readonly start: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { end: end.toISOString(), start: start.toISOString() };
}

function usageErrorFromMessage(message: string): UsageControlError {
  if (message.includes('USAGE_RATE_LIMIT_EXCEEDED')) {
    return new UsageControlError(
      'USAGE_RATE_LIMIT_EXCEEDED',
      'The workspace request rate limit was reached. Please retry shortly.',
    );
  }
  if (message.includes('USAGE_ALLOWANCE_EXCEEDED')) {
    return new UsageControlError(
      'USAGE_ALLOWANCE_EXCEEDED',
      'The workspace monthly file or tool allowance was reached.',
    );
  }
  if (message.includes('USAGE_BUDGET_EXCEEDED')) {
    return new UsageControlError(
      'USAGE_BUDGET_EXCEEDED',
      'The workspace monthly AI cost allowance was reached.',
    );
  }
  return new UsageControlError(
    'USAGE_DATA_INVALID',
    'Workspace usage controls could not be verified.',
  );
}

export async function getTenantUsageSnapshot(
  context: WorkspaceContext,
): Promise<TenantUsageSnapshot> {
  const planCode = effectivePlanCode(context);
  const plan = getProductPlan(planCode);
  let period = monthPeriod();
  let rows: readonly z.infer<typeof UsageRowSchema>[];
  let reservedMicrounits: number;

  if (getEnvironment().mockMode) {
    const state = memoryUsageState();
    rows = state.records
      .filter((record) => record.tenantId === context.actor.tenantId)
      .map((record) => ({
        cost_microunits: record.costMicrounits,
        input_units: record.inputUnits,
        operation: record.operation,
        provider: record.provider,
      }));
    reservedMicrounits = [...state.reservations.values()]
      .filter((reservation) => reservation.tenantId === context.actor.tenantId)
      .reduce((sum, reservation) => sum + reservation.costMicrounits, 0);
  } else {
    const admin = createSupabaseAdminClient();
    const subscription = await admin
      .from('tenant_subscriptions')
      .select('current_period_start, current_period_end')
      .eq('tenant_id', context.actor.tenantId)
      .single();
    const parsedPeriod = SubscriptionPeriodSchema.safeParse(subscription.data);
    if (subscription.error !== null || !parsedPeriod.success) {
      throw new UsageControlError(
        'USAGE_DATA_INVALID',
        'The workspace usage period could not be read.',
      );
    }
    period = {
      end: parsedPeriod.data.current_period_end,
      start: parsedPeriod.data.current_period_start,
    };
    const [usageResult, reservationResult] = await Promise.all([
      admin
        .from('usage_records')
        .select('provider, operation, input_units, cost_microunits')
        .eq('tenant_id', context.actor.tenantId)
        .gte('occurred_at', period.start)
        .lt('occurred_at', period.end),
      admin
        .from('usage_budget_reservations')
        .select('maximum_cost_microunits')
        .eq('tenant_id', context.actor.tenantId)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString()),
    ]);
    const usageRows = z.array(UsageRowSchema).safeParse(usageResult.data);
    const reservations = z.array(ReservationRowSchema).safeParse(reservationResult.data);
    if (
      usageResult.error !== null ||
      reservationResult.error !== null ||
      !usageRows.success ||
      !reservations.success
    ) {
      throw new UsageControlError(
        'USAGE_DATA_INVALID',
        'Workspace usage records could not be read.',
      );
    }
    rows = usageRows.data;
    reservedMicrounits = reservations.data.reduce(
      (sum, reservation) => sum + reservation.maximum_cost_microunits,
      0,
    );
  }

  const usedMicrounits = rows.reduce((sum, record) => sum + record.cost_microunits, 0);
  const ai = evaluateUsageBudget({
    budgetMicrounits: plan.monthlyAiCostBudgetMicrounits,
    reservedMicrounits,
    usedMicrounits,
  });
  const providerCostMap = new Map<string, number>();
  for (const row of rows) {
    if (row.cost_microunits > 0) {
      providerCostMap.set(
        row.provider,
        (providerCostMap.get(row.provider) ?? 0) + row.cost_microunits,
      );
    }
  }

  return {
    ai,
    periodEnd: period.end,
    periodStart: period.start,
    plan: planCode,
    providerCosts: [...providerCostMap.entries()]
      .map(([provider, costMicrounits]) => ({ costMicrounits, provider }))
      .sort((left, right) => right.costMicrounits - left.costMicrounits),
    source: {
      limitBytes: plan.monthlySourceBytes,
      usedBytes: rows
        .filter((record) => record.operation === 'source_upload')
        .reduce((sum, record) => sum + record.input_units, 0),
    },
    toolCalls: {
      limit: plan.monthlyToolCallLimit,
      used: rows
        .filter((record) => record.operation === 'tool_call')
        .reduce((sum, record) => sum + record.input_units, 0),
    },
  };
}

export async function reserveAssistantUsage(
  context: WorkspaceContext,
  input: {
    readonly inputCharacters: number;
    readonly costMultiplier?: number;
    readonly maxAttempts?: number;
    readonly maxOutputTokens: number;
    readonly operation: Extract<UsageOperation, 'chat' | 'workflow_plan' | 'website_generation'>;
    readonly provider: UsageProvider;
  },
): Promise<AssistantUsageReservation> {
  const maximumCostMicrounits = estimateMaximumAiCostMicrounits(input);
  const plan = getProductPlan(effectivePlanCode(context));
  if (maximumCostMicrounits > plan.maximumAiRequestCostMicrounits) {
    throw new UsageControlError(
      'USAGE_REQUEST_COST_EXCEEDED',
      'This request would exceed the plan single-request AI cost limit.',
    );
  }
  const costMultiplier = input.costMultiplier ?? 1;
  if (getEnvironment().mockMode) {
    const snapshot = await getTenantUsageSnapshot(context);
    if (!canReserveUsage(snapshot.ai, maximumCostMicrounits)) {
      throw new UsageControlError(
        'USAGE_BUDGET_EXCEEDED',
        'The workspace monthly AI cost allowance was reached.',
      );
    }
    const now = Date.now();
    const state = memoryUsageState();
    const firstRecentRequest = state.requestTimes.findIndex(
      (requestTime) => requestTime.createdAt > now - 60_000,
    );
    if (firstRecentRequest === -1) {
      state.requestTimes.splice(0);
    } else if (firstRecentRequest > 0) {
      state.requestTimes.splice(0, firstRecentRequest);
    }
    const recentRequests = state.requestTimes.filter(
      (requestTime) =>
        requestTime.tenantId === context.actor.tenantId && requestTime.createdAt > now - 60_000,
    ).length;
    if (recentRequests >= plan.aiRequestsPerMinute) {
      throw new UsageControlError(
        'USAGE_RATE_LIMIT_EXCEEDED',
        'The workspace request rate limit was reached. Please retry shortly.',
      );
    }
    const id = crypto.randomUUID();
    state.requestTimes.push({ createdAt: now, tenantId: context.actor.tenantId });
    state.reservations.set(id, {
      costMicrounits: maximumCostMicrounits,
      createdAt: now,
      tenantId: context.actor.tenantId,
    });
    return {
      costMultiplier,
      id,
      maximumCostMicrounits,
      async release() {
        state.reservations.delete(id);
      },
    };
  }

  const result = await createSupabaseAdminClient().rpc('reserve_tenant_usage_budget', {
    actor_id: context.actor.userId,
    target_maximum_cost_microunits: maximumCostMicrounits,
    target_operation: input.operation,
    target_provider: input.provider,
    target_tenant_id: context.actor.tenantId,
  });
  const parsed = z.string().uuid().safeParse(result.data);
  if (result.error !== null || !parsed.success) {
    throw usageErrorFromMessage(result.error?.message ?? 'USAGE_DATA_INVALID');
  }
  const id = parsed.data;
  return {
    costMultiplier,
    id,
    maximumCostMicrounits,
    async release() {
      await createSupabaseAdminClient().rpc('release_tenant_usage_reservation', {
        actor_id: context.actor.userId,
        target_reservation_id: id,
      });
    },
  };
}

export async function recordReservedAssistantUsage(
  context: WorkspaceContext,
  reservation: AssistantUsageReservation,
  conversationId: string,
  record: UsageRecord,
): Promise<void> {
  const costMicrounits = estimateAiCostMicrounits(
    record.provider,
    record.inputTokens,
    record.outputTokens,
    reservation.costMultiplier,
  );
  if (getEnvironment().mockMode) {
    memoryUsageState().records.push({
      costMicrounits,
      inputUnits: record.inputTokens,
      operation: record.operation,
      provider: record.provider,
      tenantId: context.actor.tenantId,
    });
    return;
  }
  const result = await createSupabaseAdminClient().rpc('record_tenant_ai_usage', {
    actor_id: context.actor.userId,
    target_actual_cost_microunits: costMicrounits,
    target_input_units: record.inputTokens,
    target_output_units: record.outputTokens,
    target_reservation_id: reservation.id,
    target_operation: record.operation,
    target_provider: record.provider,
    usage_metadata: {
      attempt: record.attempt,
      conversationId,
      durationMs: record.durationMs,
      model: record.model,
      outcome: record.outcome,
      rateCardVersion: INTERNAL_RATE_CARD_VERSION,
      validationCodes: record.validationCodes,
    },
  });
  if (result.error !== null) {
    throw usageErrorFromMessage(result.error.message);
  }
}

export async function consumeMeteredAllowance(
  context: WorkspaceContext,
  operation: 'source_upload' | 'tool_call',
  units: number,
  metadata: Readonly<Record<string, unknown>>,
): Promise<void> {
  if (getEnvironment().mockMode) {
    const snapshot = await getTenantUsageSnapshot(context);
    const used =
      operation === 'source_upload' ? snapshot.source.usedBytes : snapshot.toolCalls.used;
    const limit =
      operation === 'source_upload' ? snapshot.source.limitBytes : snapshot.toolCalls.limit;
    if (used + units > limit) {
      throw new UsageControlError(
        'USAGE_ALLOWANCE_EXCEEDED',
        'The workspace monthly file or tool allowance was reached.',
      );
    }
    memoryUsageState().records.push({
      costMicrounits: 0,
      inputUnits: units,
      operation,
      provider: 'platform',
      tenantId: context.actor.tenantId,
    });
    return;
  }
  const result = await createSupabaseAdminClient().rpc('consume_tenant_metered_allowance', {
    actor_id: context.actor.userId,
    target_operation: operation,
    target_tenant_id: context.actor.tenantId,
    target_units: units,
    usage_metadata: metadata,
  });
  if (result.error !== null) {
    throw usageErrorFromMessage(result.error.message);
  }
}
