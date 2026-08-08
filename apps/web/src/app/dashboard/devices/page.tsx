import type { Metadata } from 'next';

import { DevicePairingPanel } from '@/components/devices/device-pairing-panel';
import { DeviceRevokeControl } from '@/components/devices/device-revoke-control';
import { DeviceIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
import {
  effectiveAssistantDeviceStatus,
  isAssistantAgentVersionCompatible,
  MINIMUM_ASSISTANT_AGENT_VERSION,
} from '@/lib/assistant-device-status';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

export const metadata: Metadata = {
  title: '裝置',
};

const mockDevices = [
  {
    agentCompatible: true,
    agentVersion: MINIMUM_ASSISTANT_AGENT_VERSION,
    lastSeenEn: 'Online now',
    lastSeenZhHant: '目前在線',
    name: 'Erin’s MacBook',
    status: 'online',
  },
  {
    agentCompatible: true,
    agentVersion: MINIMUM_ASSISTANT_AGENT_VERSION,
    lastSeenEn: 'Seen 18 minutes ago',
    lastSeenZhHant: '18 分鐘前上線',
    name: 'Finance Windows PC',
    status: 'offline',
  },
] as const;

const ProductionDeviceSchema = z.object({
  agent_version: z.string().min(1).max(80).nullable(),
  id: z.string().uuid(),
  last_seen_at: z.string().datetime({ offset: true }).nullable(),
  name: z.string().min(1).max(120),
  status: z.enum(['offline', 'online', 'pairing', 'revoked']),
});

export default async function DevicesPage() {
  const environment = getEnvironment();
  const context = await requireWorkspaceContext();
  const canManageDevices = context.actor.role === 'owner' || context.actor.role === 'admin';
  const devices = environment.mockMode
    ? mockDevices.map((device, index) => ({ ...device, id: `mock-${index}` }))
    : await productionDevices(context.actor.tenantId);

  return (
    <div className="mx-auto max-w-[1120px]">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
        <LocalizedText en="Desktop Agents" zhHant="桌面 Agent" />
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
        <LocalizedText en="Devices" zhHant="裝置" />
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        <LocalizedText
          en="Pair authorized computers, monitor their connection, and revoke access when a device should no longer run workflows."
          zhHant="配對已授權的電腦、查看連線狀態，並在裝置不應再執行工作流時撤銷存取權。"
        />
      </p>

      <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-slate-950">
              <LocalizedText en="Paired devices" zhHant="已配對裝置" />
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              <LocalizedText
                en="Only device metadata is shown here. Folder paths and tokens stay private."
                zhHant="這裡只顯示裝置中繼資料；資料夾路徑與 Token 維持私密。"
              />
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {devices.map((device) => (
              <article className="flex items-center gap-4 px-5 py-5 sm:px-6" key={device.id}>
                <span className="grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-600">
                  <DeviceIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-950">{device.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {'lastSeenEn' in device ? (
                      <LocalizedText en={device.lastSeenEn} zhHant={device.lastSeenZhHant} />
                    ) : device.lastSeenAt === undefined ? (
                      <LocalizedText en="Not connected yet" zhHant="尚未連線" />
                    ) : (
                      new Date(device.lastSeenAt).toLocaleString()
                    )}
                  </p>
                  <p
                    className={`mt-1 text-[11px] font-semibold ${
                      device.agentCompatible ? 'text-slate-500' : 'text-amber-700'
                    }`}
                  >
                    {device.agentCompatible ? (
                      `Desktop Agent v${device.agentVersion}`
                    ) : (
                      <LocalizedText
                        en={`Update required · install v${MINIMUM_ASSISTANT_AGENT_VERSION} or newer`}
                        zhHant={`需要更新 · 請安裝 v${MINIMUM_ASSISTANT_AGENT_VERSION} 以上版本`}
                      />
                    )}
                  </p>
                  {!environment.mockMode && canManageDevices && (
                    <DeviceRevokeControl deviceId={device.id} deviceName={device.name} />
                  )}
                </div>
                <span
                  className={`size-2.5 rounded-full ${
                    !device.agentCompatible
                      ? 'bg-amber-400'
                      : device.status === 'online'
                        ? 'bg-emerald-500'
                        : 'bg-slate-300'
                  }`}
                />
              </article>
            ))}
            {devices.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate-800">
                  <LocalizedText en="No paired devices" zhHant="尚無已配對裝置" />
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  <LocalizedText
                    en="Generate a pairing code to connect the first Desktop Agent."
                    zhHant="產生配對碼以連接第一個 Desktop Agent。"
                  />
                </p>
              </div>
            )}
          </div>
        </section>

        {canManageDevices ? (
          <DevicePairingPanel />
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-semibold text-slate-950">
              <LocalizedText en="Administrator access required" zhHant="需要管理員權限" />
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              <LocalizedText
                en="Ask a workspace owner or administrator to pair or revoke Desktop Agents."
                zhHant="請由工作區擁有者或管理員配對或撤銷 Desktop Agent。"
              />
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

async function productionDevices(tenantId: string) {
  const result = await createSupabaseAdminClient()
    .from('devices')
    .select('id, name, status, last_seen_at, agent_version')
    .eq('tenant_id', tenantId)
    .neq('status', 'revoked')
    .order('name');
  if (result.error !== null) {
    throw new Error('Desktop Agent metadata could not be loaded.');
  }
  return z
    .array(ProductionDeviceSchema)
    .parse(result.data)
    .map((device) => ({
      agentCompatible: isAssistantAgentVersionCompatible(device.agent_version),
      agentVersion: device.agent_version ?? 'unknown',
      id: device.id,
      ...(device.last_seen_at === null ? {} : { lastSeenAt: device.last_seen_at }),
      name: device.name,
      status:
        device.status === 'online'
          ? effectiveAssistantDeviceStatus(device.status, device.last_seen_at)
          : device.status,
    }));
}
