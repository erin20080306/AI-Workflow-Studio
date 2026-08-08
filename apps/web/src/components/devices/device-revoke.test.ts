import { describe, expect, it, vi } from 'vitest';

import { requestDeviceRevocation } from './device-revoke';

const DEVICE_ID = '40bf12ee-25b4-45d0-ad94-11a487f5f047';

describe('requestDeviceRevocation', () => {
  it('posts to the bounded device route and accepts the exact success response', async () => {
    const request = vi.fn(async () => ({
      json: async () => ({ revoked: true }),
      ok: true,
    }));

    await expect(requestDeviceRevocation(DEVICE_ID, request)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(`/api/agent/devices/${DEVICE_ID}/revoke`, {
      method: 'POST',
    });
  });

  it.each([
    { body: { revoked: false }, ok: true },
    { body: { revoked: true, token: 'must-not-be-returned' }, ok: true },
    { body: { revoked: true }, ok: false },
  ])('rejects an unsuccessful or malformed response', async ({ body, ok }) => {
    const request = vi.fn(async () => ({
      json: async () => body,
      ok,
    }));

    await expect(requestDeviceRevocation(DEVICE_ID, request)).rejects.toThrow(
      'The Desktop Agent could not be revoked.',
    );
  });
});
