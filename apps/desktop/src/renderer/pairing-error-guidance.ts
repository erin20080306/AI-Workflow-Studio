import type { PairDeviceErrorCode } from '../shared/contracts';

export type DesktopErrorCode = PairDeviceErrorCode | 'DESKTOP_ACTION_FAILED';
export type DesktopLocale = 'en' | 'zh-Hant';

const guidance: Readonly<Record<DesktopErrorCode, Readonly<Record<DesktopLocale, string>>>> = {
  AGENT_DEVICE_LIMIT_REACHED: {
    en: 'This workspace has reached its active device limit. Revoke an old device in the Web console, then retry this code if it is still valid or create a fresh one.',
    'zh-Hant':
      '此工作區已達啟用裝置上限。請先到 Web 控制台撤銷舊裝置；若目前配對碼尚未過期可直接重試，否則請建立新碼。',
  },
  AGENT_PAIRING_EXPIRED: {
    en: 'This pairing code has expired. Create a fresh code in the Web console and try again.',
    'zh-Hant': '此配對碼已過期。請到 Web 控制台建立新的配對碼後再試。',
  },
  AGENT_PAIRING_INVALID: {
    en: 'This pairing code is invalid or has already been used. Create a fresh code in the Web console and try again.',
    'zh-Hant': '此配對碼無效或已使用。請到 Web 控制台建立新的配對碼後再試。',
  },
  AGENT_SERVER_NOT_CONFIGURED: {
    en: 'The Agent service is not configured on this Web deployment. Ask the workspace administrator to finish the server setup, then create a fresh pairing code.',
    'zh-Hant':
      '這個 Web 部署尚未完成 Agent 服務設定。請由工作區管理員完成伺服器設定，再建立新的配對碼。',
  },
  DESKTOP_ACTION_FAILED: {
    en: 'The action did not complete. Review the local Agent status and try again.',
    'zh-Hant': '操作未完成。請檢查本機 Agent 狀態後再試。',
  },
  PAIRING_FAILED: {
    en: 'Pairing did not complete. Check the network and secure local storage. If a new device appeared in the Web console, revoke it before trying again.',
    'zh-Hant':
      '配對未完成。請檢查網路與本機安全儲存；若 Web 控制台已出現新裝置，請先撤銷該裝置再重試。',
  },
};

export function desktopErrorGuidance(locale: DesktopLocale, code: DesktopErrorCode): string {
  return guidance[code][locale];
}
