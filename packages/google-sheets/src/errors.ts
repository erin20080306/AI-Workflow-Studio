export type GoogleSheetsErrorCode =
  | 'GOOGLE_AUTHORIZATION_INVALID'
  | 'GOOGLE_CONNECTION_REVOKED'
  | 'GOOGLE_IDEMPOTENCY_CONFLICT'
  | 'GOOGLE_NOT_CONFIGURED'
  | 'GOOGLE_RATE_LIMITED'
  | 'GOOGLE_REQUEST_AMBIGUOUS'
  | 'GOOGLE_REQUEST_FAILED'
  | 'GOOGLE_REQUEST_INVALID'
  | 'GOOGLE_RESPONSE_INVALID'
  | 'GOOGLE_TOKEN_ENCRYPTION_FAILED'
  | 'GOOGLE_TOKEN_REFRESH_FAILED';

export class GoogleSheetsError extends Error {
  readonly code: GoogleSheetsErrorCode;
  readonly retryable: boolean;

  constructor(
    code: GoogleSheetsErrorCode,
    message: string,
    options: { readonly cause?: unknown; readonly retryable?: boolean } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.name = 'GoogleSheetsError';
    this.retryable = options.retryable ?? false;
  }
}
