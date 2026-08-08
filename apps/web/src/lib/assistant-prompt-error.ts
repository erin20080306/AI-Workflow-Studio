export type AssistantPromptError =
  | 'authentication'
  | 'desktop'
  | 'google'
  | 'google_reauthorization'
  | 'model'
  | 'rate'
  | 'short'
  | 'temporary'
  | 'unavailable';

export function assistantPromptErrorForCode(code: string): Exclude<AssistantPromptError, 'short'> {
  if (code === 'AI_GOOGLE_REAUTHORIZATION_REQUIRED') return 'google_reauthorization';
  if (code === 'AI_GOOGLE_CONNECTION_REQUIRED') return 'google';
  if (code === 'AI_DESKTOP_REQUIRED') return 'desktop';
  if (code === 'AI_PROVIDER_AUTHENTICATION_FAILED') return 'authentication';
  if (code === 'AI_PROVIDER_QUOTA_EXCEEDED' || code === 'AI_PROVIDER_RATE_LIMITED') return 'rate';
  if (code === 'AI_PROVIDER_NOT_CONFIGURED') return 'model';
  if (code === 'AI_PROVIDER_REQUEST_FAILED' || code === 'AI_PROVIDER_TIMEOUT') return 'temporary';
  return 'unavailable';
}
