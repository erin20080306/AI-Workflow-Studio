import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import type {
  AgentSnapshot,
  DesktopAgentBridge,
  FolderGrantView,
  LogEntry,
} from '../shared/contracts';

type View = 'activity' | 'folders' | 'overview' | 'settings';

const previewSnapshot: AgentSnapshot = {
  agentVersion: '0.1.0-dev',
  autoStart: false,
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
  const [view, setView] = useState<View>('overview');
  const [snapshot, setSnapshot] = useState<AgentSnapshot>(previewSnapshot);
  const [folders, setFolders] = useState<readonly FolderGrantView[]>([]);
  const [logs, setLogs] = useState<readonly LogEntry[]>([]);
  const [pairingCode, setPairingCode] = useState('');
  const [agentBaseUrl, setAgentBaseUrl] = useState('http://127.0.0.1:3000');
  const [folderPermissions, setFolderPermissions] = useState({
    read: true,
    watch: true,
    write: false,
  });
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const previewMode = window.desktopAgent === undefined;

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

  const connectionLabel = useMemo(
    () =>
      ({
        offline: '離線',
        online: '在線',
        reconnecting: '重新連線中',
        unpaired: '尚未配對',
      })[snapshot.connection],
    [snapshot.connection],
  );

  async function perform<T>(key: string, action: () => Promise<T>): Promise<T | undefined> {
    setBusy(key);
    setError(undefined);
    try {
      return await action();
    } catch {
      setError('操作未完成。請檢查配對碼、網路或本機安全儲存後再試。');
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
    { id: 'overview', label: '總覽', mark: '⌁' },
    { id: 'folders', label: '資料夾權限', mark: '□' },
    { id: 'activity', label: '執行紀錄', mark: '↗' },
    { id: 'settings', label: '設定', mark: '◇' },
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
          <p>{snapshot.deviceName ?? '等待裝置配對'}</p>
          <small>v{snapshot.agentVersion}</small>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">Local-first automation</span>
            <h1>
              {view === 'overview'
                ? 'Agent 總覽'
                : view === 'folders'
                  ? '資料夾權限'
                  : view === 'activity'
                    ? '執行紀錄'
                    : 'Agent 設定'}
            </h1>
          </div>
          <div className="topbar-actions">
            {previewMode && <span className="preview-badge">Renderer Preview</span>}
            <span className="privacy-badge">
              <span>●</span>
              {snapshot.privacyMode ? '隱私模式開啟' : '隱私模式關閉'}
            </span>
          </div>
        </header>

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        {view === 'overview' && (
          <div className="view-stack">
            {!snapshot.paired ? (
              <section className="pairing-card">
                <div className="pairing-copy">
                  <span className="section-kicker">Secure pairing</span>
                  <h2>連結這台電腦</h2>
                  <p>
                    先在 Web 控制台建立 12 位配對碼，再於此完成一次性配對。裝置 Token
                    只會加密保存在作業系統安全儲存。
                  </p>
                  <ul>
                    <li>不將完整 Excel 自動上傳至雲端</li>
                    <li>只有授權 Folder Alias 能被執行器存取</li>
                    <li>Token、路徑與資料列不寫入日誌</li>
                  </ul>
                </div>
                <form className="pair-form" onSubmit={(event) => void pair(event)}>
                  <label>
                    Agent Server
                    <input
                      onChange={(event) => setAgentBaseUrl(event.target.value)}
                      spellCheck={false}
                      value={agentBaseUrl}
                    />
                  </label>
                  <label>
                    12 位配對碼
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
                    {busy === 'pair' ? '正在安全配對…' : '完成裝置配對'}
                  </button>
                </form>
              </section>
            ) : (
              <>
                <section className="hero-status">
                  <div>
                    <span className="section-kicker">Device ready</span>
                    <h2>{snapshot.deviceName}</h2>
                    <p>
                      {snapshot.executorRunning
                        ? 'Heartbeat 與 Job polling 正在執行。'
                        : 'Agent 已配對；啟動執行器後才會輪詢工作。'}
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
                    {snapshot.executorRunning ? '停止執行器' : '啟動執行器'}
                  </button>
                </section>

                <section className="metric-grid">
                  <article>
                    <Icon tone="emerald">●</Icon>
                    <span>連線狀態</span>
                    <strong>{connectionLabel}</strong>
                    <small>
                      {snapshot.lastHeartbeatAt ? 'Heartbeat 已驗證' : '等待 Heartbeat'}
                    </small>
                  </article>
                  <article>
                    <Icon>↗</Icon>
                    <span>待處理工作</span>
                    <strong>{snapshot.pendingJobCount}</strong>
                    <small>只顯示此裝置的工作</small>
                  </article>
                  <article>
                    <Icon tone="slate">□</Icon>
                    <span>授權資料夾</span>
                    <strong>{folders.length}</strong>
                    <small>Cloud 不保存原始路徑</small>
                  </article>
                  <article>
                    <Icon tone="slate">◇</Icon>
                    <span>Agent 版本</span>
                    <strong>{snapshot.agentVersion}</strong>
                    <small>更新必須由使用者啟動</small>
                  </article>
                </section>

                <section className="privacy-panel">
                  <div className="privacy-orb">◎</div>
                  <div>
                    <span className="section-kicker">Privacy boundary</span>
                    <h2>完整試算表留在這台裝置</h2>
                    <p>
                      Agent 只回傳 Run
                      ID、狀態、耗時、計數與遮罩錯誤；未經明確允許，不上傳完整資料列或本機絕對路徑。
                    </p>
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
                <span className="section-kicker">System picker only</span>
                <h2>新增授權資料夾</h2>
                <p>只有經過系統資料夾選擇器確認的 canonical root 才會建立 Folder Alias。</p>
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
                    {permission === 'read' ? '讀取' : permission === 'write' ? '寫入' : '監看'}
                  </label>
                ))}
                <button
                  className="primary-button"
                  disabled={!snapshot.paired || busy === 'folder'}
                  onClick={() => void chooseFolder()}
                  type="button"
                >
                  開啟系統選擇器
                </button>
              </div>
            </section>

            <section className="section-card">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Authorized aliases</span>
                  <h2>本機權限清單</h2>
                </div>
                <span className="count-pill">{folders.length} folders</span>
              </div>
              {folders.length === 0 ? (
                <div className="empty-state">尚未授權資料夾。未授權路徑一律拒絕。</div>
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
                            <span key={permission}>{permission}</span>
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
                        移除
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
                <span className="section-kicker">Redacted JSON logs</span>
                <h2>最近活動</h2>
              </div>
              <span className="count-pill">{logs.length} events</span>
            </div>
            <div className="log-list">
              {logs.length === 0 ? (
                <div className="empty-state">尚無活動記錄。</div>
              ) : (
                [...logs].reverse().map((entry, index) => (
                  <article key={`${entry.occurredAt}-${entry.code}-${index}`}>
                    <span className={`log-level log-${entry.level}`}>{entry.level}</span>
                    <div>
                      <strong>{entry.code}</strong>
                      <p>{entry.message}</p>
                    </div>
                    <time>{new Date(entry.occurredAt).toLocaleTimeString('zh-TW')}</time>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {view === 'settings' && (
          <div className="settings-grid">
            <section className="section-card">
              <span className="section-kicker">Local controls</span>
              <h2>隱私與啟動</h2>
              <div className="setting-row">
                <div>
                  <strong>隱私模式</strong>
                  <p>只回傳計數與遮罩 metadata；不傳完整資料列。</p>
                </div>
                <Toggle
                  checked={snapshot.privacyMode}
                  label="切換隱私模式"
                  onChange={(enabled) =>
                    void perform('privacy', async () => {
                      setSnapshot(await bridge.setPrivacyMode(enabled));
                    })
                  }
                />
              </div>
              <div className="setting-row">
                <div>
                  <strong>開機自動啟動</strong>
                  <p>登入系統後開啟 Agent；不代表自動執行工作。</p>
                </div>
                <Toggle
                  checked={snapshot.autoStart}
                  label="切換開機自動啟動"
                  onChange={(enabled) =>
                    void perform('autostart', async () => {
                      setSnapshot(await bridge.setAutoStart(enabled));
                    })
                  }
                />
              </div>
            </section>

            <section className="section-card update-card">
              <span className="section-kicker">Manual updates only</span>
              <h2>軟體更新</h2>
              <p>{snapshot.update.message}</p>
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
                  手動檢查更新
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
                    同意並下載
                  </button>
                )}
              </div>
              <small>autoDownload = false · 未經按鈕確認不下載</small>
            </section>

            <section className="section-card danger-card">
              <span className="section-kicker">Device session</span>
              <h2>登出並解除本機配對</h2>
              <p>停止 polling 並移除 OS 加密的本機 Token。雲端撤銷仍可在 Web 控制台執行。</p>
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
                清除本機裝置 Session
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
