const DEFAULT_RUN_TIMEOUT_MS = 1_800_000;
const MINIMUM_RUN_TIMEOUT_MS = 30_000;
const MAXIMUM_RUN_TIMEOUT_MS = 86_400_000;

export function nextRetryTimeoutAt(
  run: { readonly createdAt: string; readonly timeoutAt: string },
  now = new Date(),
): string {
  const configuredWindow = new Date(run.timeoutAt).getTime() - new Date(run.createdAt).getTime();
  const windowMs = Number.isFinite(configuredWindow)
    ? Math.min(MAXIMUM_RUN_TIMEOUT_MS, Math.max(MINIMUM_RUN_TIMEOUT_MS, configuredWindow))
    : DEFAULT_RUN_TIMEOUT_MS;
  return new Date(now.getTime() + windowMs).toISOString();
}
