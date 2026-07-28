import type { UsageRecord } from '@ai-workflow-studio/ai-gateway';

export function shouldSettleAssistantUsage(record: UsageRecord, maxAttempts: number): boolean {
  return record.outcome !== 'invalid' || record.attempt >= maxAttempts;
}

export function aggregateAssistantUsageRecords(records: readonly UsageRecord[]): UsageRecord {
  const terminalRecord = records.at(-1);
  if (terminalRecord === undefined) {
    throw new Error('AI usage aggregation requires at least one record.');
  }
  return {
    ...terminalRecord,
    durationMs: records.reduce((sum, item) => sum + item.durationMs, 0),
    inputTokens: records.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: records.reduce((sum, item) => sum + item.outputTokens, 0),
    validationCodes: [...new Set(records.flatMap((item) => item.validationCodes))].sort(),
  };
}
