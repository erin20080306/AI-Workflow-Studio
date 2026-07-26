'use client';

import { useState } from 'react';
import { z } from 'zod';

import { DeviceIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';

const PairingResponseSchema = z.object({
  expiresAt: z.string().datetime({ offset: true }),
  pairingCode: z.string().regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/),
});

const copy = {
  'zh-Hant': {
    button: '產生配對碼',
    deviceName: '裝置名稱',
    error: '目前無法建立配對碼，請稍後再試。',
    expiry: '配對碼將在 10 分鐘內失效，使用後立即作廢。',
    helper: '在即將安裝 AI Workflow Studio Desktop Agent 的電腦上輸入此代碼。',
    placeholder: '例如：Erin 的 MacBook',
    ready: '配對碼已建立',
    submitting: '建立中…',
    title: '配對新的 Desktop Agent',
  },
  en: {
    button: 'Generate pairing code',
    deviceName: 'Device name',
    error: 'A pairing code cannot be created right now. Try again later.',
    expiry: 'The code expires in 10 minutes and becomes invalid immediately after use.',
    helper: 'Enter this code on the computer where AI Workflow Studio Desktop Agent is installed.',
    placeholder: 'For example: Erin’s MacBook',
    ready: 'Pairing code created',
    submitting: 'Creating…',
    title: 'Pair a new Desktop Agent',
  },
} as const;

export function DevicePairingPanel() {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [pairing, setPairing] = useState<z.infer<typeof PairingResponseSchema> | null>(null);

  async function createPairing(formData: FormData): Promise<void> {
    const deviceName = formData.get('deviceName');
    if (typeof deviceName !== 'string' || deviceName.trim().length === 0) {
      setError(true);
      return;
    }

    setPending(true);
    setError(false);
    try {
      const response = await fetch('/api/agent/pair/start', {
        body: JSON.stringify({ deviceName }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const parsed = PairingResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        setError(true);
        return;
      }
      setPairing(parsed.data);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
          <DeviceIcon className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">{text.title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{text.helper}</p>
        </div>
      </div>

      <form action={createPairing} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium text-slate-800">
          {text.deviceName}
          <input
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm"
            maxLength={120}
            name="deviceName"
            placeholder={text.placeholder}
            required
          />
        </label>
        <button
          className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-slate-500"
          disabled={pending}
          type="submit"
        >
          {pending ? text.submitting : text.button}
        </button>
      </form>

      {error && (
        <p
          className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {text.error}
        </p>
      )}

      {pairing !== null && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5" role="status">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            {text.ready}
          </p>
          <p className="mt-3 break-all font-mono text-3xl font-semibold tracking-[0.16em] text-slate-950">
            {pairing.pairingCode}
          </p>
          <p className="mt-3 text-xs leading-5 text-emerald-900">{text.expiry}</p>
        </div>
      )}
    </section>
  );
}
