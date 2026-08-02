import { describe, expect, it } from 'vitest';

import { assistantPromptErrorForCode } from './assistant-prompt-error';

describe('assistantPromptErrorForCode', () => {
  it('routes Drive prerequisites to explicit authorization guidance', () => {
    expect(assistantPromptErrorForCode('AI_GOOGLE_CONNECTION_REQUIRED')).toBe('google');
    expect(assistantPromptErrorForCode('AI_DESKTOP_REQUIRED')).toBe('desktop');
  });

  it('keeps provider and unknown failures distinct from authorization requirements', () => {
    expect(assistantPromptErrorForCode('AI_PROVIDER_AUTHENTICATION_FAILED')).toBe('authentication');
    expect(assistantPromptErrorForCode('AI_PROVIDER_RATE_LIMITED')).toBe('rate');
    expect(assistantPromptErrorForCode('UNKNOWN_CODE')).toBe('unavailable');
  });
});
