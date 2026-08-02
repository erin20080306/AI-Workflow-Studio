import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import type {
  AgentSnapshot,
  DesktopAgentBridge,
  FolderGrantView,
  LogEntry,
} from '../shared/contracts';
import { defaultControlPlaneOrigin } from './control-plane';

type View = 'activity' | 'folders' | 'overview' | 'settings';
type DesktopLocale = 'en' | 'zh-Hant';
const DESKTOP_LOCALE_KEY = 'ai-workflow-studio-desktop-locale';

const previewSnapshot: AgentSnapshot = {
  agentVersion: '0.1.0-dev',
  autoStart: false,
  computerUse: {
    enabled: false,
    permission: 'granted',
    platform: 'macos',
    status: 'idle',
    takeoverAvailable: false,
  },
  connection: 'unpaired',
  executorRunning: false,
  paired: false,
  pendingJobCount: 0,
  privacyMode: true,
  update: {
    downloaded: false,
    message: '尚未檢查更新',
    status: 'idle',
  },
};

function createPreviewBridge(): DesktopAgentBridge {
  let snapshot = previewSnapshot;
  let folders: FolderGrantView[] = [];
  const snapshotListeners = new Set<(value: AgentSnapshot) => void>();
  const emit = (next: AgentSnapshot) => {
    snapshot = next;
    for (const listener of snapshotListeners) {
      listener(next);
    }
    return Promise.resolve(next);
  };
  return {
    async chooseFolder(permissions) {
      const grant: FolderGrantView = {
        createdAt: new Date().toISOString(),
        displayName: '訂單匯入',
        folderAliasId: '10000000-0000-4000-8000-000000000801',
        permissions,
      };
      folders = [grant];
      return grant;
    },
    clearSession: () => {
      const { deviceName, lastHeartbeatAt, ...unpairedSnapshot } = snapshot;
      void deviceName;
      void lastHeartbeatAt;
      return emit({
        ...unpairedSnapshot,
        connection: 'unpaired',
        executorRunning: false,
        paired: false,
      });
    },
    downloadUpdate: () =>
      emit({
        ...snapshot,
        update: {
          downloaded: false,
          message: '開發預覽不下載更新。',
          status: 'up-to-date',
        },
      }),
    getSnapshot: () => Promise.resolve(snapshot),
    listFolders: () => Promise.resolve(folders),
    listLogs: () =>
      Promise.resolve([
        {
          code: 'PREVIEW_MODE',
          level: 'info',
          message: 'Renderer preview uses no local files or network services.',
          metadata: { privacyMode: true },
          occurredAt: new Date().toISOString(),
        },
      ]),
    onLog: () => () => undefined,
    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
    pair: () =>
      emit({
        ...snapshot,
        connection: 'offline',
        deviceName: 'Preview Mac',
        paired: true,
      }),
    async removeFolder() {
      folders = [];
      return folders;
    },
    setAutoStart: (enabled) => emit({ ...snapshot, autoStart: enabled }),
    setComputerUseEnabled: (enabled) =>
      emit({
        ...snapshot,
        computerUse: {
          ...snapshot.computerUse,
          enabled,
          status: 'idle',
        },
      }),
    setExecutorRunning: (running) =>
      emit({
        ...snapshot,
        connection: running ? 'online' : 'offline',
        executorRunning: running,
        ...(running
          ? { lastHeartbeatAt: new Date().toISOString() }
          : snapshot.lastHeartbeatAt === undefined
            ? {}
            : { lastHeartbeatAt: snapshot.lastHeartbeatAt }),
        pendingJobCount: running ? 1 : 0,
      }),
    setPrivacyMode: (enabled) => emit({ ...snapshot, privacyMode: enabled }),
    startUpdateCheck: () =>
      emit({
        ...snapshot,
        update: {
          downloaded: false,
          message: '開發預覽已是最新版本。',
          status: 'up-to-date',
        },
      }),
    takeOverComputerUse: () =>
      emit({
        ...snapshot,
        computerUse: {
          ...snapshot.computerUse,
          status: 'user_takeover',
          takeoverAvailable: false,
        },
        executorRunning: false,
      }),
  };
}

const previewBridge = createPreviewBridge();

function Icon({
  children,
  tone = 'indigo',
}: {
  readonly children: ReactNode;
  readonly tone?: 'emerald' | 'indigo' | 'slate';
}) {
  return <span className={`icon-box icon-${tone}`}>{children}</span>;
}

function StatusDot({ connection }: { readonly connection: AgentSnapshot['connection'] }) {
  return <span className={`status-dot status-${connection}`} aria-hidden="true" />;
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={checked}
      className={`toggle ${checked ? 'toggle-on' : ''}`}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span />
    </button>
  );
}

export function DesktopAgentApp() {
  const bridge = window.desktopAgent ?? previewBridge;
  const [locale, setLocale] = useState<DesktopLocale>(() =>
    window.localStorage.getItem(DESKTOP_LOCALE_KEY) === 'en' ? 'en' : 'zh-Hant',
  );
  const [view, setView] = useState<View>('overview');
  const [snapshot, setSnapshot] = useState<AgentSnapshot>(previewSnapshot);
  const [folders, setFolders] = useState<readonly FolderGrantView[]>([]);
  const [logs, setLogs] = useState<readonly LogEntry[]>([]);
  const [pairingCode, setPairingCode] = useState('');
  const [agentBaseUrl, setAgentBaseUrl] = useState(defaultControlPlaneOrigin);
  const [folderPermissions, setFolderPermissions] = useState({
    read: true,
    watch: true,
    write: false,
  });
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState(false);
  const previewMode = window.desktopAgent === undefined;
  const t = (en: string, zhHant: string) => (locale === 'en' ? en : zhHant);

  function changeLocale(nextLocale: DesktopLocale) {
    setLocale(nextLocale);
    window.localStorage.setItem(DESKTOP_LOCALE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
  }

  useEffect(() => {
    let active = true;
    void Promise.all([bridge.getSnapshot(), bridge.listFolders(), bridge.listLogs()]).then(
      ([initialSnapshot, initialFolders, initialLogs]) => {
        if (active) {
          setSnapshot(initialSnapshot);
          setFolders(initialFolders);
          setLogs(initialLogs);
        }
      },
    );
    const unsubscribeSnapshot = bridge.onSnapshot(setSnapshot);
    const unsubscribeLog = bridge.onLog((entry) => {
      setLogs((current) => [...current.slice(-199), entry]);
    });
    return () => {
      active = false;
      unsubscribeSnapshot();
      unsubscribeLog();
    };
  }, [bridge]);

  const connectionLabel = {
    offline: t('Offline', '離線'),
    online: t('Online', '在線'),
    reconnecting: t('Reconnecting', '重新連線中'),
    unpaired: t('Not paired', '尚未配對'),
  }[snapshot.connection];
  const updateMessage = {
    checking: t('Checking for updates…', '正在檢查更新…'),
    downloading: t('Downloading the approved update…', '正在下載已核准的更新…'),
    error: t('The update check did not complete.', '更新檢查未完成。'),
    idle: t('Updates have not been checked.', '尚未檢查更新。'),
    ready: snapshot.update.downloaded
      ? t('The approved update is ready to install.', '已核准的更新可供安裝。')
      : t('An update is available for review.', '有可供檢視的更新。'),
    'up-to-date': t('This is the latest available version.', '目前已是最新版本。'),
  }[snapshot.update.status];
  const computerUseStatus = {
    failed: t('Last visible action failed', '上次可見操作失敗'),
    idle: t('Ready for an approved action', '等待已核准動作'),
    opening_excel: t('Opening Microsoft Excel…', '正在開啟 Microsoft Excel…'),
    permission_denied: t('Accessibility permission required', '需要輔助使用權限'),
    running: t('Operating visibly in Excel…', '正在 Excel 畫面中操作…'),
    unsupported: t('This platform is not supported', '此平台目前不支援'),
    user_takeover: t('Stopped for local user takeover', '已由本機使用者接管停止'),
    verifying: t('Verifying the active workbook…', '正在驗證目前活頁簿…'),
  }[snapshot.computerUse.status];
  const computerUseAction =
    snapshot.computerUse.currentAction === 'excel.open_workbook'
      ? t('Open approved workbook', '開啟已核准活頁簿')
      : snapshot.computerUse.currentAction === 'excel.autofit_used_range'
        ? t('AutoFit used rows and columns', '自動調整使用中欄列')
        : snapshot.computerUse.currentAction === 'excel.save_workbook'
          ? t('Save approved workbook', '儲存已核准活頁簿')
          : snapshot.computerUse.currentAction === 'excel.verify_active_workbook'
            ? t('Verify active workbook', '驗證目前活頁簿')
            : undefined;

  async function perform<T>(key: string, action: () => Promise<T>): Promise<T | undefined> {
    setBusy(key);
    setError(false);
    try {
      return await action();
    } catch {
      setError(true);
      return undefined;
    } finally {
      setBusy(undefined);
    }
  }

  async function pair(event: FormEvent) {
    event.preventDefault();
    const result = await perform('pair', () =>
      bridge.pair({
        agentBaseUrl,
        pairingCode: pairingCode.trim().toUpperCase(),
      }),
    );
    if (result !== undefined) {
      setSnapshot(result);
      setPairingCode('');
    }
  }

  async function chooseFolder() {
    const grant = await perform('folder', () => bridge.chooseFolder(folderPermissions));
    if (grant !== undefined) {
      setFolders(await bridge.listFolders());
    }
  }

  const navigation: readonly {
    readonly id: View;
    readonly label: string;
    readonly mark: string;
  }[] = [
    { id: 'overview', label: t('Overview', '總覽'), mark: '⌁' },
    { id: 'folders', label: t('Folder permissions', '資料夾權限'), mark: '□' },
    { id: 'activity', label: t('Run history', '執行紀錄'), mark: '↗' },
    { id: 'settings', label: t('Settings', '設定'), mark: '◇' },
  ];

  return (
    <div className="desktop-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">A</div>
          <div>
            <strong>AI Workflow Studio</strong>
            <span>Desktop Agent</span>
          </div>
        </div>

        <nav aria-label="Desktop Agent">
          {navigation.map((item) => (
            <button
              className={view === item.id ? 'nav-active' : ''}
              key={item.id}
              onClick={() => setView(item.id)}
              type="button"
            >
              <span className="nav-mark">{item.mark}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <div className="status-heading">
            <StatusDot connection={snapshot.connection} />
            <span>{connectionLabel}</span>
          </div>
          <p>{snapshot.deviceName ?? t('Waiting for device pairing', '等待裝置配對')}</p>
          <small>v{snapshot.agentVersion}</small>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">{t('Local-first automation', '本機優先自動化')}</span>
            <h1>
              {view === 'overview'
                ? t('Agent overview', 'Agent 總覽')
                : view === 'folders'
                  ? t('Folder permissions', '資料夾權限')
                  : view === 'activity'
                    ? t('Run history', '執行紀錄')
                    : t('Agent settings', 'Agent 設定')}
            </h1>
          </div>
          <div className="topbar-actions">
            <div aria-label="Language / 語言" className="language-switcher" role="group">
              <button
                aria-pressed={locale === 'zh-Hant'}
                className={locale === 'zh-Hant' ? 'language-active' : ''}
                onClick={() => changeLocale('zh-Hant')}
                type="button"
              >
                中文
              </button>
              <button
                aria-pressed={locale === 'en'}
                className={locale === 'en' ? 'language-active' : ''}
                onClick={() => changeLocale('en')}
                type="button"
              >
                EN
              </button>
            </div>
            {previewMode && (
              <span className="preview-badge">{t('Renderer preview', '介面預覽')}</span>
            )}
            <span className="privacy-badge">
              <span>●</span>
              {snapshot.privacyMode
                ? t('Privacy mode on', '隱私模式開啟')
                : t('Privacy mode off', '隱私模式關閉')}
            </span>
          </div>
        </header>

        {error && (
          <div className="error-banner" role="alert">
            {t(
              'The action did not complete. Check the pairing code, network, or secure local storage and try again.',
              '操作未完成。請檢查配對碼、網路或本機安全儲存後再試。',
            )}
          </div>
        )}

        {view === 'overview' && (
          <div className="view-stack">
            {!snapshot.paired ? (
              <section className="pairing-card">
                <div className="pairing-copy">
                  <span className="section-kicker">{t('Secure pairing', '安全配對')}</span>
                  <h2>{t('Connect this computer', '連結這台電腦')}</h2>
                  <p>
                    {t(
                      'Create a 12-character code in the Web console, then complete one-time pairing here. The device token is encrypted in the operating system’s secure storage.',
                      '先在 Web 控制台建立 12 位配對碼，再於此完成一次性配對。裝置 Token 只會加密保存在作業系統安全儲存。',
                    )}
                  </p>
                  <ul>
                    <li>
                      {t(
                        'Complete Excel files are never uploaded automatically',
                        '不將完整 Excel 自動上傳至雲端',
                      )}
                    </li>
                    <li>
                      {t(
                        'The executor accesses only approved folder aliases',
                        '只有授權 Folder Alias 能被執行器存取',
                      )}
                    </li>
                    <li>
                      {t(
                        'Tokens, paths, and rows are excluded from logs',
                        'Token、路徑與資料列不寫入日誌',
                      )}
                    </li>
                  </ul>
                </div>
                <form className="pair-form" onSubmit={(event) => void pair(event)}>
                  <label>
                    {t('Agent server', 'Agent 伺服器')}
                    <input
                      onChange={(event) => setAgentBaseUrl(event.target.value)}
                      spellCheck={false}
                      value={agentBaseUrl}
                    />
                  </label>
                  <label>
                    {t('12-character pairing code', '12 位配對碼')}
                    <input
                      autoComplete="one-time-code"
                      className="pair-code"
                      maxLength={12}
                      onChange={(event) =>
                        setPairingCode(event.target.value.replace(/\s/g, '').toUpperCase())
                      }
                      placeholder="ABCD2345EFGH"
                      value={pairingCode}
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={busy === 'pair' || pairingCode.length !== 12}
                    type="submit"
                  >
                    {busy === 'pair'
                      ? t('Pairing securely…', '正在安全配對…')
                      : t('Pair device', '完成裝置配對')}
                  </button>
                </form>
              </section>
            ) : (
              <>
                <section className="hero-status">
                  <div>
                    <span className="section-kicker">{t('Device ready', '裝置已就緒')}</span>
                    <h2>{snapshot.deviceName}</h2>
                    <p>
                      {snapshot.executorRunning
                        ? t(
                            'Heartbeat and job polling are active.',
                            'Heartbeat 與工作輪詢正在執行。',
                          )
                        : t(
                            'The Agent is paired. Start the executor to begin polling for jobs.',
                            'Agent 已配對；啟動執行器後才會輪詢工作。',
                          )}
                    </p>
                  </div>
                  <button
                    className={snapshot.executorRunning ? 'secondary-button' : 'primary-button'}
                    disabled={busy === 'executor'}
                    onClick={() =>
                      void perform('executor', async () => {
                        const next = await bridge.setExecutorRunning(!snapshot.executorRunning);
                        setSnapshot(next);
                      })
                    }
                    type="button"
                  >
                    {snapshot.executorRunning
                      ? t('Stop executor', '停止執行器')
                      : t('Start executor', '啟動執行器')}
                  </button>
                </section>

                <section className="metric-grid">
                  <article>
                    <Icon tone="emerald">●</Icon>
                    <span>{t('Connection', '連線狀態')}</span>
                    <strong>{connectionLabel}</strong>
                    <small>
                      {snapshot.lastHeartbeatAt
                        ? t('Heartbeat verified', 'Heartbeat 已驗證')
                        : t('Waiting for heartbeat', '等待 Heartbeat')}
                    </small>
                  </article>
                  <article>
                    <Icon>↗</Icon>
                    <span>{t('Pending jobs', '待處理工作')}</span>
                    <strong>{snapshot.pendingJobCount}</strong>
                    <small>{t('Jobs for this device only', '只顯示此裝置的工作')}</small>
                  </article>
                  <article>
                    <Icon tone="slate">□</Icon>
                    <span>{t('Approved folders', '授權資料夾')}</span>
                    <strong>{folders.length}</strong>
                    <small>{t('The cloud never stores source paths', '雲端不保存原始路徑')}</small>
                  </article>
                  <article>
                    <Icon tone="slate">◇</Icon>
                    <span>{t('Agent version', 'Agent 版本')}</span>
                    <strong>{snapshot.agentVersion}</strong>
                    <small>{t('Updates require user action', '更新必須由使用者啟動')}</small>
                  </article>
                </section>

                <section className="privacy-panel">
                  <div className="privacy-orb">◎</div>
                  <div>
                    <span className="section-kicker">{t('Privacy boundary', '隱私邊界')}</span>
                    <h2>
                      {t('Complete spreadsheets stay on this device', '完整試算表留在這台裝置')}
                    </h2>
                    <p>
                      {t(
                        'The Agent returns only run ID, status, duration, counts, and redacted errors. It never uploads complete rows or absolute local paths without explicit permission.',
                        'Agent 只回傳執行 ID、狀態、耗時、計數與遮罩錯誤；未經明確允許，不上傳完整資料列或本機絕對路徑。',
                      )}
                    </p>
                  </div>
                </section>
                <section className="section-card">
                  <div className="section-heading">
                    <div>
                      <span className="section-kicker">
                        {t('Visible Computer Use', '可見電腦操作')}
                      </span>
                      <h2>{computerUseStatus}</h2>
                      <p>
                        {computerUseAction ??
                          t(
                            'Excel actions run only after local opt-in and workflow approval.',
                            'Excel 動作只會在本機啟用且工作流已核准後執行。',
                          )}
                      </p>
                    </div>
                    {snapshot.computerUse.takeoverAvailable && (
                      <button
                        className="danger-button"
                        onClick={() =>
                          void perform('take-over', async () => {
                            setSnapshot(await bridge.takeOverComputerUse());
                          })
                        }
                        type="button"
                      >
                        {t('Take over and stop', '接管並停止')}
                      </button>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        {view === 'folders' && (
          <div className="view-stack">
            <section className="section-card folder-authorize">
              <div>
                <span className="section-kicker">
                  {t('System picker only', '僅使用系統選擇器')}
                </span>
                <h2>{t('Authorize a folder', '新增授權資料夾')}</h2>
                <p>
                  {t(
                    'A folder alias is created only for a canonical root confirmed by the system folder picker.',
                    '只有經過系統資料夾選擇器確認的標準根目錄才會建立資料夾別名。',
                  )}
                </p>
              </div>
              <div className="permission-picker">
                {(['read', 'write', 'watch'] as const).map((permission) => (
                  <label key={permission}>
                    <input
                      checked={folderPermissions[permission]}
                      onChange={(event) =>
                        setFolderPermissions((current) => ({
                          ...current,
                          [permission]: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    {permission === 'read'
                      ? t('Read', '讀取')
                      : permission === 'write'
                        ? t('Write', '寫入')
                        : t('Watch', '監看')}
                  </label>
                ))}
                <button
                  className="primary-button"
                  disabled={!snapshot.paired || busy === 'folder'}
                  onClick={() => void chooseFolder()}
                  type="button"
                >
                  {t('Open system picker', '開啟系統選擇器')}
                </button>
              </div>
            </section>

            <section className="section-card">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">{t('Authorized aliases', '已授權別名')}</span>
                  <h2>{t('Local permission list', '本機權限清單')}</h2>
                </div>
                <span className="count-pill">
                  {folders.length} {t('folders', '個資料夾')}
                </span>
              </div>
              {folders.length === 0 ? (
                <div className="empty-state">
                  {t(
                    'No folders are authorized. Every unauthorized path is denied.',
                    '尚未授權資料夾。未授權路徑一律拒絕。',
                  )}
                </div>
              ) : (
                <div className="folder-list">
                  {folders.map((folder) => (
                    <article key={folder.folderAliasId}>
                      <Icon>□</Icon>
                      <div>
                        <strong>{folder.displayName}</strong>
                        <span>Alias …{folder.folderAliasId.slice(-8)}</span>
                      </div>
                      <div className="permission-tags">
                        {Object.entries(folder.permissions)
                          .filter(([, enabled]) => enabled)
                          .map(([permission]) => (
                            <span key={permission}>
                              {permission === 'read'
                                ? t('Read', '讀取')
                                : permission === 'write'
                                  ? t('Write', '寫入')
                                  : t('Watch', '監看')}
                            </span>
                          ))}
                      </div>
                      <button
                        className="text-button danger"
                        onClick={() =>
                          void perform('remove-folder', async () => {
                            setFolders(await bridge.removeFolder(folder.folderAliasId));
                          })
                        }
                        type="button"
                      >
                        {t('Remove', '移除')}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {view === 'activity' && (
          <section className="section-card">
            <div className="section-heading">
              <div>
                <span className="section-kicker">
                  {t('Redacted JSON logs', '已遮罩 JSON 日誌')}
                </span>
                <h2>{t('Recent activity', '最近活動')}</h2>
              </div>
              <span className="count-pill">
                {logs.length} {t('events', '筆事件')}
              </span>
            </div>
            <div className="log-list">
              {logs.length === 0 ? (
                <div className="empty-state">{t('No activity yet.', '尚無活動記錄。')}</div>
              ) : (
                [...logs].reverse().map((entry, index) => (
                  <article key={`${entry.occurredAt}-${entry.code}-${index}`}>
                    <span className={`log-level log-${entry.level}`}>{entry.level}</span>
                    <div>
                      <strong>{entry.code}</strong>
                      <p>{entry.message}</p>
                    </div>
                    <time>
                      {new Date(entry.occurredAt).toLocaleTimeString(
                        locale === 'en' ? 'en-US' : 'zh-TW',
                      )}
                    </time>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {view === 'settings' && (
          <div className="settings-grid">
            <section className="section-card">
              <span className="section-kicker">{t('Local controls', '本機控制')}</span>
              <h2>{t('Privacy and startup', '隱私與啟動')}</h2>
              <div className="setting-row">
                <div>
                  <strong>{t('Privacy mode', '隱私模式')}</strong>
                  <p>
                    {t(
                      'Return counts and redacted metadata only—never complete rows.',
                      '只回傳計數與遮罩後的中繼資料；不傳完整資料列。',
                    )}
                  </p>
                </div>
                <Toggle
                  checked={snapshot.privacyMode}
                  label={t('Toggle privacy mode', '切換隱私模式')}
                  onChange={(enabled) =>
                    void perform('privacy', async () => {
                      setSnapshot(await bridge.setPrivacyMode(enabled));
                    })
                  }
                />
              </div>
              <div className="setting-row">
                <div>
                  <strong>{t('Launch at startup', '開機自動啟動')}</strong>
                  <p>
                    {t(
                      'Open the Agent after system sign-in; jobs still require their configured controls.',
                      '登入系統後開啟 Agent；不代表自動執行工作。',
                    )}
                  </p>
                </div>
                <Toggle
                  checked={snapshot.autoStart}
                  label={t('Toggle launch at startup', '切換開機自動啟動')}
                  onChange={(enabled) =>
                    void perform('autostart', async () => {
                      setSnapshot(await bridge.setAutoStart(enabled));
                    })
                  }
                />
              </div>
              <div className="setting-row">
                <div>
                  <strong>{t('Visible Excel operation', 'Excel 可見操作')}</strong>
                  <p>
                    {t(
                      'Allow approved workflows to visibly open, format, save, and verify .xlsx workbooks. macOS requires Accessibility permission.',
                      '允許已核准工作流在畫面中開啟、格式化、儲存並驗證 .xlsx；macOS 需授予輔助使用權限。',
                    )}
                  </p>
                  <small>{computerUseStatus}</small>
                </div>
                <Toggle
                  checked={snapshot.computerUse.enabled}
                  label={t('Toggle visible Excel operation', '切換 Excel 可見操作')}
                  onChange={(enabled) =>
                    void perform('computer-use', async () => {
                      setSnapshot(await bridge.setComputerUseEnabled(enabled));
                    })
                  }
                />
              </div>
            </section>

            <section className="section-card update-card">
              <span className="section-kicker">{t('Manual updates only', '僅手動更新')}</span>
              <h2>{t('Software updates', '軟體更新')}</h2>
              <p>{updateMessage}</p>
              <div className="button-row">
                <button
                  className="secondary-button"
                  disabled={busy === 'update' || snapshot.update.status === 'checking'}
                  onClick={() =>
                    void perform('update', async () => {
                      setSnapshot(await bridge.startUpdateCheck());
                    })
                  }
                  type="button"
                >
                  {t('Check for updates', '手動檢查更新')}
                </button>
                {snapshot.update.status === 'ready' && !snapshot.update.downloaded && (
                  <button
                    className="primary-button"
                    onClick={() =>
                      void perform('download', async () => {
                        setSnapshot(await bridge.downloadUpdate());
                      })
                    }
                    type="button"
                  >
                    {t('Approve and download', '同意並下載')}
                  </button>
                )}
              </div>
              <small>
                autoDownload = false ·{' '}
                {t('No download without button confirmation', '未經按鈕確認不下載')}
              </small>
            </section>

            <section className="section-card danger-card">
              <span className="section-kicker">{t('Device session', '裝置 Session')}</span>
              <h2>{t('Sign out and unpair locally', '登出並解除本機配對')}</h2>
              <p>
                {t(
                  'Stop polling and remove the OS-encrypted local token. Cloud revocation remains available in the Web console.',
                  '停止輪詢並移除作業系統加密的本機 Token。雲端撤銷仍可在 Web 控制台執行。',
                )}
              </p>
              <button
                className="danger-button"
                disabled={!snapshot.paired || busy === 'unpair'}
                onClick={() =>
                  void perform('unpair', async () => {
                    setSnapshot(await bridge.clearSession());
                    setFolders([]);
                    setView('overview');
                  })
                }
                type="button"
              >
                {t('Clear local device session', '清除本機裝置 Session')}
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
