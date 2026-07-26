import { describe, expect, it } from 'vitest';

import { redactLogValue } from './logger';

describe('desktop structured log redaction', () => {
  it('removes device credentials, authorization, local paths, and row content', () => {
    const value = redactLogValue({
      authorization: 'Bearer dvt_plaintext-device-token-value-that-is-long',
      message:
        'Failed at /Users/customer/Documents/orders/private.xlsx with clm_claim-secret-value-that-is-long',
      nested: {
        prompt: 'upload all customer data',
        rowValues: ['Alice', '4111111111111111'],
      },
    });
    const serialized = JSON.stringify(value);

    expect(serialized).not.toContain('plaintext-device-token');
    expect(serialized).not.toContain('claim-secret');
    expect(serialized).not.toContain('/Users/customer');
    expect(serialized).not.toContain('Alice');
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).toContain('[LOCAL_PATH]');
  });
});
