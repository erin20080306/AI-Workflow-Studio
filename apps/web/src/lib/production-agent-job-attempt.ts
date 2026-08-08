interface ProductionAgentJobAttemptInput {
  readonly idempotencyKey: string;
  readonly runAttempt: number;
  readonly runId: string;
}

export function isCurrentProductionAgentJobAttempt(input: ProductionAgentJobAttemptInput): boolean {
  return input.idempotencyKey === `${input.runId}:desktop:${Math.max(1, input.runAttempt)}`;
}
