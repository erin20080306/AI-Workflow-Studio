import { z } from 'zod';

const DeviceRevokeResponseSchema = z
  .object({
    revoked: z.literal(true),
  })
  .strict();

interface DeviceRevokeHttpResponse {
  readonly ok: boolean;
  json(): Promise<unknown>;
}

export type DeviceRevokeFetch = (
  input: string,
  init: RequestInit,
) => Promise<DeviceRevokeHttpResponse>;

export async function requestDeviceRevocation(
  deviceId: string,
  request: DeviceRevokeFetch = fetch,
): Promise<void> {
  const response = await request(`/api/agent/devices/${encodeURIComponent(deviceId)}/revoke`, {
    method: 'POST',
  });
  const parsed = DeviceRevokeResponseSchema.safeParse(await response.json());
  if (!response.ok || !parsed.success) {
    throw new Error('The Desktop Agent could not be revoked.');
  }
}
