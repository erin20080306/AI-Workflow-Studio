'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useLanguage } from '@/components/language-provider';

import { requestDeviceRevocation } from './device-revoke';

interface DeviceRevokeControlProps {
  readonly deviceId: string;
  readonly deviceName: string;
}

const copy = {
  'zh-Hant': {
    cancel: '保留裝置',
    confirm: '確認撤銷',
    error: '裝置撤銷失敗，請稍後再試。',
    revoke: '撤銷裝置',
    revoking: '撤銷中…',
    warning: (name: string) =>
      `撤銷「${name}」後，裝置 Token 與伺服器端工作將立即取消；正在使用 Excel 或 Drive 的本機操作會在下一次心跳停止，必要時可在 Desktop 按「接管」。若 Desktop 仍顯示已配對，請在 Agent 設定中清除本機裝置 Session，再輸入新的配對碼。`,
  },
  en: {
    cancel: 'Keep device',
    confirm: 'Confirm revoke',
    error: 'The device could not be revoked. Try again later.',
    revoke: 'Revoke device',
    revoking: 'Revoking…',
    warning: (name: string) =>
      `Revoking “${name}” immediately invalidates its token and cancels server-side jobs. A local Excel or Drive action stops at the next heartbeat; use Take over in Desktop if needed. If Desktop still appears paired, clear its local device session in Agent settings before entering a fresh code.`,
  },
} as const;

export function DeviceRevokeControl({ deviceId, deviceName }: DeviceRevokeControlProps) {
  const { locale } = useLanguage();
  const router = useRouter();
  const text = copy[locale];
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  async function revoke(): Promise<void> {
    setPending(true);
    setError(false);
    try {
      await requestDeviceRevocation(deviceId);
      setConfirming(false);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <div className="mt-3">
        <button
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
          onClick={() => {
            setError(false);
            setConfirming(true);
          }}
          type="button"
        >
          {text.revoke}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 max-w-xl rounded-xl border border-red-200 bg-red-50 p-3">
      <p className="text-xs leading-5 text-red-900">{text.warning(deviceName)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            setError(false);
          }}
          type="button"
        >
          {text.cancel}
        </button>
        <button
          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:bg-red-400"
          disabled={pending}
          onClick={() => void revoke()}
          type="button"
        >
          {pending ? text.revoking : text.confirm}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-xs font-medium text-red-900" role="alert">
          {text.error}
        </p>
      )}
    </div>
  );
}
