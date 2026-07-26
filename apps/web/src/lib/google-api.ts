import 'server-only';

import { GoogleSheetsError } from '@ai-workflow-studio/google-sheets';

const statusByCode = {
  GOOGLE_AUTHORIZATION_INVALID: 401,
  GOOGLE_CONNECTION_REVOKED: 410,
  GOOGLE_IDEMPOTENCY_CONFLICT: 409,
  GOOGLE_NOT_CONFIGURED: 503,
  GOOGLE_RATE_LIMITED: 429,
  GOOGLE_REQUEST_AMBIGUOUS: 409,
  GOOGLE_REQUEST_FAILED: 502,
  GOOGLE_REQUEST_INVALID: 400,
  GOOGLE_RESPONSE_INVALID: 502,
  GOOGLE_TOKEN_ENCRYPTION_FAILED: 503,
  GOOGLE_TOKEN_REFRESH_FAILED: 401,
} as const;

export function googleApiError(error: unknown): Response {
  const apiError =
    error instanceof GoogleSheetsError
      ? error
      : new GoogleSheetsError(
          'GOOGLE_REQUEST_FAILED',
          'Google Sheets request could not be completed.',
        );
  return Response.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        retryable: apiError.retryable,
      },
    },
    {
      headers: { 'cache-control': 'no-store' },
      status: statusByCode[apiError.code],
    },
  );
}
