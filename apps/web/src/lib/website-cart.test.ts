import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { WEBSITE_CART_SCRIPT, WEBSITE_CART_SCRIPT_SHA256 } from './website-cart';

describe('website cart script', () => {
  it('matches its allow-listed CSP hash so only this exact script can run', () => {
    const digest = createHash('sha256').update(WEBSITE_CART_SCRIPT, 'utf8').digest('base64');
    expect(WEBSITE_CART_SCRIPT_SHA256).toBe(`sha256-${digest}`);
  });

  it('contains no network calls, eval, or nested script terminator', () => {
    expect(WEBSITE_CART_SCRIPT).not.toContain('</script');
    expect(WEBSITE_CART_SCRIPT).not.toMatch(/\beval\b|\bfetch\b|XMLHttpRequest|import\(/u);
  });
});
