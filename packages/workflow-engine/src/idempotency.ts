import type { WorkflowExecutionResult } from './runner';

export interface IdempotencyStore {
  get(key: string): Promise<WorkflowExecutionResult | undefined>;
  record(key: string, result: WorkflowExecutionResult): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly results = new Map<string, WorkflowExecutionResult>();

  async get(key: string): Promise<WorkflowExecutionResult | undefined> {
    return this.results.get(key);
  }

  async record(key: string, result: WorkflowExecutionResult): Promise<void> {
    this.results.set(key, result);
  }
}
