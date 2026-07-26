import electronUpdater, { type AppUpdater } from 'electron-updater';

import type { AgentSnapshot } from '../shared/contracts';
import type { StructuredLogger } from './logger';

type UpdateSnapshot = AgentSnapshot['update'];

export class ManualUpdateController {
  private readonly updater: AppUpdater;
  private state: UpdateSnapshot = {
    downloaded: false,
    message: '尚未檢查更新',
    status: 'idle',
  };

  constructor(
    private readonly packaged: boolean,
    private readonly logger: StructuredLogger,
    private readonly onChange: (state: UpdateSnapshot) => void,
  ) {
    const { autoUpdater } = electronUpdater;
    this.updater = autoUpdater;
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowPrerelease = false;
    this.bindEvents();
  }

  async check(): Promise<UpdateSnapshot> {
    if (!this.packaged) {
      return this.setState({
        downloaded: false,
        message: '開發版本不連線更新；正式簽章套件才會啟用。',
        status: 'up-to-date',
      });
    }
    this.setState({
      downloaded: false,
      message: '正在檢查已簽章更新…',
      status: 'checking',
    });
    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      this.logger.warn('UPDATE_CHECK_FAILED', 'Manual update check failed.', {
        type: error instanceof Error ? error.name : 'UnknownError',
      });
      this.setState({
        downloaded: false,
        message: '更新檢查失敗，請稍後再試。',
        status: 'error',
      });
    }
    return this.getState();
  }

  async download(): Promise<UpdateSnapshot> {
    if (!this.packaged || this.state.status !== 'ready' || this.state.downloaded) {
      return this.getState();
    }
    this.setState({
      ...this.state,
      message: '使用者已同意，正在下載更新…',
      status: 'downloading',
    });
    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      this.logger.warn('UPDATE_DOWNLOAD_FAILED', 'User-initiated update download failed.', {
        type: error instanceof Error ? error.name : 'UnknownError',
      });
      this.setState({
        ...this.state,
        downloaded: false,
        message: '更新下載失敗，未安裝任何內容。',
        status: 'error',
      });
    }
    return this.getState();
  }

  getState(): UpdateSnapshot {
    return structuredClone(this.state);
  }

  private bindEvents(): void {
    this.updater.on('update-available', (info) => {
      this.setState({
        downloaded: false,
        message: `版本 ${info.version} 可用；按下下載才會開始。`,
        status: 'ready',
        version: info.version,
      });
    });
    this.updater.on('update-not-available', (info) => {
      this.setState({
        downloaded: false,
        message: '目前已是最新版本。',
        status: 'up-to-date',
        version: info.version,
      });
    });
    this.updater.on('download-progress', (progress) => {
      this.setState({
        ...this.state,
        message: `更新下載中 ${Math.round(progress.percent)}%`,
        status: 'downloading',
      });
    });
    this.updater.on('update-downloaded', (info) => {
      this.setState({
        downloaded: true,
        message: '更新已下載並驗證；請由使用者重新啟動以安裝。',
        status: 'ready',
        version: info.version,
      });
    });
    this.updater.on('error', (error) => {
      this.logger.warn('UPDATE_ERROR', 'Update provider reported an error.', {
        type: error.name,
      });
    });
  }

  private setState(state: UpdateSnapshot): UpdateSnapshot {
    this.state = structuredClone(state);
    this.onChange(this.getState());
    return this.getState();
  }
}
