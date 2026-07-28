import type { UsageRecord } from '@ai-workflow-studio/ai-gateway';
import { describe, expect, it } from 'vitest';

import {
  aggregateAssistantUsageRecords,
  shouldSettleAssistantUsage,
} from './assistant-usage-settlement';

function usageRecord(
  input: Partial<UsageRecord> & Pick<UsageRecord, 'attempt' | 'outcome'>,
): UsageRecord {
  return {
    durationMs: 100,
    inputTokens: 10,
    model: 'gemini-3.5-flash-lite',
    operation: 'workflow_plan',
    outputTokens: 20,
    provider: 'gemini',
    validationCodes: [],
    ...input,
  };
}

describe('assistant usage settlement', () => {
  it('waits through repairable invalid output and settles on success', () => {
    expect(shouldSettleAssistantUsage(usageRecord({ attempt: 1, outcome: 'invalid' }), 2)).toBe(
      false,
    );
    expect(shouldSettleAssistantUsage(usageRecord({ attempt: 2, outcome: 'succeeded' }), 2)).toBe(
      true,
    );
  });

  it('settles the final invalid attempt so provider cost is still recorded', () => {
    expect(shouldSettleAssistantUsage(usageRecord({ attempt: 2, outcome: 'invalid' }), 2)).toBe(
      true,
    );
  });

  it('aggregates all attempts into one terminal usage record', () => {
    const aggregate = aggregateAssistantUsageRecords([
      usageRecord({
        attempt: 1,
        durationMs: 200,
        inputTokens: 100,
        outcome: 'invalid',
        outputTokens: 50,
        validationCodes: ['node_invalid'],
      }),
      usageRecord({
        attempt: 2,
        durationMs: 300,
        inputTokens: 120,
        outcome: 'succeeded',
        outputTokens: 70,
        validationCodes: ['node_invalid', 'edge_invalid'],
      }),
    ]);

    expect(aggregate).toMatchObject({
      attempt: 2,
      durationMs: 500,
      inputTokens: 220,
      outcome: 'succeeded',
      outputTokens: 120,
      validationCodes: ['edge_invalid', 'node_invalid'],
    });
  });
});
