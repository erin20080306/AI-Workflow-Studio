import { describe, expect, it } from 'vitest';

import { desktopErrorGuidance, type DesktopErrorCode } from './pairing-error-guidance';

describe('desktopErrorGuidance', () => {
  it('tells the user to revoke an old device before retrying or creating a fresh code', () => {
    expect(desktopErrorGuidance('en', 'AGENT_DEVICE_LIMIT_REACHED')).toBe(
      'This workspace has reached its active device limit. Revoke an old device in the Web console, then retry this code if it is still valid or create a fresh one.',
    );
    expect(desktopErrorGuidance('zh-Hant', 'AGENT_DEVICE_LIMIT_REACHED')).toBe(
      '此工作區已達啟用裝置上限。請先到 Web 控制台撤銷舊裝置；若目前配對碼尚未過期可直接重試，否則請建立新碼。',
    );
  });

  it.each<[DesktopErrorCode, string, string]>([
    [
      'AGENT_PAIRING_EXPIRED',
      'This pairing code has expired. Create a fresh code in the Web console and try again.',
      '此配對碼已過期。請到 Web 控制台建立新的配對碼後再試。',
    ],
    [
      'AGENT_PAIRING_INVALID',
      'This pairing code is invalid or has already been used. Create a fresh code in the Web console and try again.',
      '此配對碼無效或已使用。請到 Web 控制台建立新的配對碼後再試。',
    ],
    [
      'AGENT_SERVER_NOT_CONFIGURED',
      'The Agent service is not configured on this Web deployment. Ask the workspace administrator to finish the server setup, then create a fresh pairing code.',
      '這個 Web 部署尚未完成 Agent 服務設定。請由工作區管理員完成伺服器設定，再建立新的配對碼。',
    ],
    [
      'PAIRING_FAILED',
      'Pairing did not complete. Check the network and secure local storage. If a new device appeared in the Web console, revoke it before trying again.',
      '配對未完成。請檢查網路與本機安全儲存；若 Web 控制台已出現新裝置，請先撤銷該裝置再重試。',
    ],
  ])('returns fixed bilingual guidance for %s', (code, en, zhHant) => {
    expect(desktopErrorGuidance('en', code)).toBe(en);
    expect(desktopErrorGuidance('zh-Hant', code)).toBe(zhHant);
  });
});
