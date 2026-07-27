export type AiGatewayErrorCode =
  | 'AI_OUTPUT_INVALID'
  | 'AI_PROVIDER_AUTHENTICATION_FAILED'
  | 'AI_PROVIDER_CANCELLED'
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'AI_PROVIDER_RATE_LIMITED'
  | 'AI_PROVIDER_REQUEST_FAILED'
  | 'AI_PROVIDER_RESPONSE_INVALID'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_REQUEST_INVALID'
  | 'AI_USAGE_LOG_FAILED';

export class AiGatewayError extends Error {
  readonly code: AiGatewayErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;

  constructor(
    code: AiGatewayErrorCode,
    message: string,
    options: {
      readonly cause?: unknown;
      readonly details?: Readonly<Record<string, unknown>>;
      readonly retryable?: boolean;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AiGatewayError';
    this.code = code;
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? false;
  }
}
