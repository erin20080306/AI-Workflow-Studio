const ASSISTANT_DEVICE_FRESHNESS_MS = 90_000;
const ALLOWED_CLOCK_SKEW_MS = 30_000;
export const MINIMUM_ASSISTANT_AGENT_VERSION = '0.2.5';

interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease?: readonly string[];
}

const SEMANTIC_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

function semanticVersion(input: string): SemanticVersion | undefined {
  const match = SEMANTIC_VERSION_PATTERN.exec(input.trim());
  if (match === null) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return undefined;
  const prerelease = match[4]?.split('.');
  if (prerelease?.some((identifier) => /^\d+$/u.test(identifier) && /^0\d+/u.test(identifier))) {
    return undefined;
  }
  return {
    major,
    minor,
    patch,
    ...(prerelease === undefined ? {} : { prerelease }),
  };
}

function comparePrerelease(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^\d+$/u.test(leftIdentifier);
    const rightNumeric = /^\d+$/u.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      if (leftIdentifier.length !== rightIdentifier.length) {
        return leftIdentifier.length - rightIdentifier.length;
      }
      return leftIdentifier.localeCompare(rightIdentifier, 'en');
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier.localeCompare(rightIdentifier, 'en');
  }
  return 0;
}

function compareSemanticVersions(left: SemanticVersion, right: SemanticVersion): number {
  for (const field of ['major', 'minor', 'patch'] as const) {
    if (left[field] !== right[field]) return left[field] - right[field];
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export function isAssistantAgentVersionCompatible(
  agentVersion: string | null | undefined,
  minimumVersion = MINIMUM_ASSISTANT_AGENT_VERSION,
): boolean {
  if (agentVersion === null || agentVersion === undefined) return false;
  const candidate = semanticVersion(agentVersion);
  const minimum = semanticVersion(minimumVersion);
  return (
    candidate !== undefined &&
    minimum !== undefined &&
    compareSemanticVersions(candidate, minimum) >= 0
  );
}

export function effectiveAssistantDeviceStatus(
  storedStatus: 'offline' | 'online',
  lastSeenAt: string | null,
  now: Date = new Date(),
): 'offline' | 'online' {
  if (storedStatus !== 'online' || lastSeenAt === null) return 'offline';
  const lastSeenTime = Date.parse(lastSeenAt);
  const ageMs = now.getTime() - lastSeenTime;
  if (!Number.isFinite(lastSeenTime) || ageMs < -ALLOWED_CLOCK_SKEW_MS) return 'offline';
  return ageMs <= ASSISTANT_DEVICE_FRESHNESS_MS ? 'online' : 'offline';
}
