import { describe, expect, it } from 'vitest';

import { defaultControlPlaneOrigin } from './control-plane';

describe('defaultControlPlaneOrigin', () => {
  it('pairs packaged agents with the production control plane by default', () => {
    expect(defaultControlPlaneOrigin(undefined)).toBe('https://www.erin-aiworkflowstudio.com');
  });

  it('allows an explicit HTTPS origin or local development server', () => {
    expect(defaultControlPlaneOrigin('https://preview.example.test/path')).toBe(
      'https://preview.example.test',
    );
    expect(defaultControlPlaneOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });

  it('rejects unsafe remote HTTP and credential-bearing URLs', () => {
    expect(defaultControlPlaneOrigin('http://example.test')).toBe(
      'https://www.erin-aiworkflowstudio.com',
    );
    expect(defaultControlPlaneOrigin('https://user:password@example.test')).toBe(
      'https://www.erin-aiworkflowstudio.com',
    );
  });
});
