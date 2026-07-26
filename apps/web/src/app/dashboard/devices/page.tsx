import type { Metadata } from 'next';

import { DevicePairingPanel } from '@/components/devices/device-pairing-panel';
import { DeviceIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
import { getEnvironment } from '@/lib/env';

export const metadata: Metadata = {
  title: '裝置',
};

const mockDevices = [
  {
    lastSeenEn: 'Online now',
    lastSeenZhHant: '目前在線',
    name: 'Erin’s MacBook',
    status: 'online',
  },
  {
    lastSeenEn: 'Seen 18 minutes ago',
    lastSeenZhHant: '18 分鐘前上線',
    name: 'Finance Windows PC',
    status: 'offline',
  },
] as const;

export default function DevicesPage() {
  const environment = getEnvironment();
  const devices = environment.mockMode ? mockDevices : [];

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
              <article className="flex items-center gap-4 px-5 py-5 sm:px-6" key={device.name}>
                <span className="grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-600">
                  <DeviceIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-950">{device.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    <LocalizedText en={device.lastSeenEn} zhHant={device.lastSeenZhHant} />
                  </p>
                </div>
                <span
                  className={`size-2.5 rounded-full ${
                    device.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300'
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

        <DevicePairingPanel />
      </div>
    </div>
  );
}
