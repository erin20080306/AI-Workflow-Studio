import { AiGatewayError } from './errors';
import type { UsageRecord, UsageSink } from './types';

export class InMemoryUsageSink implements UsageSink {
  readonly records: UsageRecord[] = [];

  async record(record: UsageRecord): Promise<void> {
    this.records.push(structuredClone(record));
  }
}

export class RedactedConsoleUsageSink implements UsageSink {
  async record(record: UsageRecord): Promise<void> {
    const safeRecord = {
      attempt: record.attempt,
      durationMs: record.durationMs,
      inputTokens: record.inputTokens,
      model: record.model,
      operation: record.operation,
      outcome: record.outcome,
      outputTokens: record.outputTokens,
      provider: record.provider,
      validationCodes: record.validationCodes,
    };
    console.info(JSON.stringify({ aiUsage: safeRecord }));
  }
}

export async function recordUsage(sink: UsageSink, record: UsageRecord): Promise<void> {
  try {
    await sink.record(record);
  } catch (error) {
    throw new AiGatewayError(
      'AI_USAGE_LOG_FAILED',
      'AI usage could not be recorded; the output was not released.',
      { cause: error },
    );
  }
}
