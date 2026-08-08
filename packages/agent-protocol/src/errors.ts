export const AgentErrorCodes = [
  'AGENT_AUTHENTICATION_FAILED',
  'AGENT_DEVICE_LIMIT_REACHED',
  'AGENT_DEVICE_REVOKED',
  'AGENT_FORBIDDEN',
  'AGENT_JOB_CONFLICT',
  'AGENT_JOB_NOT_FOUND',
  'AGENT_LEASE_EXPIRED',
  'AGENT_PAIRING_EXPIRED',
  'AGENT_PAIRING_INVALID',
  'AGENT_REQUEST_INVALID',
  'AGENT_SERVER_NOT_CONFIGURED',
  'AGENT_TIMESTAMP_INVALID',
] as const;

export type AgentErrorCode = (typeof AgentErrorCodes)[number];

export class AgentProtocolError extends Error {
  readonly code: AgentErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: AgentErrorCode,
    message: string,
    options: {
      readonly cause?: unknown;
      readonly details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.details = options.details;
    this.name = 'AgentProtocolError';
  }
}
