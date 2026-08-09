export type LocalExecutorErrorCode =
  | 'FILE_ALREADY_PROCESSED'
  | 'FILE_FORMAT_UNSUPPORTED'
  | 'FILE_LIMIT_EXCEEDED'
  | 'FILE_NOT_FOUND'
  | 'FILE_OUTPUT_EXISTS'
  | 'FILE_OUTPUT_INVALID'
  | 'FILE_UNSAFE_CONTENT'
  | 'FILE_WRITE_FAILED'
  | 'WATCH_CONFIGURATION_INVALID'
  | 'WORKBOOK_COMBINE_FAILED'
  | 'WORKBOOK_CONVERSION_FAILED';

export class LocalExecutorError extends Error {
  readonly code: LocalExecutorErrorCode;
  readonly retryable: boolean;

  constructor(
    code: LocalExecutorErrorCode,
    message: string,
    options: { readonly cause?: unknown; readonly retryable?: boolean } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.name = 'LocalExecutorError';
    this.retryable = options.retryable ?? false;
  }
}
