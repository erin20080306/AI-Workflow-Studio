import type { Workflow } from '@ai-workflow-studio/workflow-schema';

import type { WorkflowRunView } from './types';

export interface RunRecord {
  readonly definitionHash: string;
  readonly eventIds: Set<string>;
  readonly view: WorkflowRunView;
  readonly workflow: Workflow;
}

function cloneRecord(record: RunRecord): RunRecord {
  return {
    definitionHash: record.definitionHash,
    eventIds: new Set(record.eventIds),
    view: structuredClone(record.view),
    workflow: structuredClone(record.workflow),
  };
}

export class InMemoryRunStore {
  private readonly idempotency = new Map<string, string>();
  private readonly records = new Map<string, RunRecord>();

  create(record: RunRecord): void {
    this.records.set(record.view.id, cloneRecord(record));
    this.idempotency.set(`${record.view.tenantId}:${record.view.idempotencyKey}`, record.view.id);
  }

  findByIdempotency(tenantId: string, idempotencyKey: string): RunRecord | undefined {
    const runId = this.idempotency.get(`${tenantId}:${idempotencyKey}`);
    return runId === undefined ? undefined : this.get(tenantId, runId);
  }

  get(tenantId: string, runId: string): RunRecord | undefined {
    const record = this.records.get(runId);
    return record?.view.tenantId === tenantId ? cloneRecord(record) : undefined;
  }

  list(tenantId: string): readonly RunRecord[] {
    return [...this.records.values()]
      .filter((record) => record.view.tenantId === tenantId)
      .sort((left, right) => right.view.createdAt.localeCompare(left.view.createdAt))
      .map(cloneRecord);
  }

  save(record: RunRecord): void {
    const existing = this.records.get(record.view.id);
    if (existing === undefined || existing.view.tenantId !== record.view.tenantId) {
      throw new Error('Run record is unavailable.');
    }
    this.records.set(record.view.id, cloneRecord(record));
  }

  snapshot(): readonly RunRecord[] {
    return [...this.records.values()].map(cloneRecord);
  }
}
