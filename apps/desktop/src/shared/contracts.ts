export const IPC_CHANNELS = {
  chooseFolder: 'folders:choose',
  clearSession: 'agent:clear-session',
  downloadUpdate: 'updates:download',
  getSnapshot: 'agent:get-snapshot',
  listFolders: 'folders:list',
  listLogs: 'logs:list',
  onLog: 'logs:event',
  onSnapshot: 'agent:snapshot',
  pair: 'agent:pair',
  removeFolder: 'folders:remove',
  setAutoStart: 'settings:auto-start',
  setExecutorRunning: 'agent:executor-running',
  setPrivacyMode: 'settings:privacy-mode',
  startUpdateCheck: 'updates:check',
} as const;

export interface FolderGrantView {
  readonly createdAt: string;
  readonly displayName: string;
  readonly folderAliasId: string;
  readonly permissions: {
    readonly read: boolean;
    readonly watch: boolean;
    readonly write: boolean;
  };
}

export interface LogEntry {
  readonly code: string;
  readonly level: 'error' | 'info' | 'warn';
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface AgentSnapshot {
  readonly agentVersion: string;
  readonly autoStart: boolean;
  readonly connection: 'offline' | 'online' | 'reconnecting' | 'unpaired';
  readonly deviceName?: string;
  readonly executorRunning: boolean;
  readonly lastHeartbeatAt?: string;
  readonly paired: boolean;
  readonly pendingJobCount: number;
  readonly privacyMode: boolean;
  readonly update: {
    readonly downloaded: boolean;
    readonly message: string;
    readonly status: 'checking' | 'downloading' | 'error' | 'idle' | 'ready' | 'up-to-date';
    readonly version?: string;
  };
}

export interface PairDeviceInput {
  readonly agentBaseUrl: string;
  readonly pairingCode: string;
}

export interface FolderPermissionInput {
  readonly read: boolean;
  readonly watch: boolean;
  readonly write: boolean;
}

export interface DesktopAgentBridge {
  chooseFolder(permissions: FolderPermissionInput): Promise<FolderGrantView | undefined>;
  clearSession(): Promise<AgentSnapshot>;
  downloadUpdate(): Promise<AgentSnapshot>;
  getSnapshot(): Promise<AgentSnapshot>;
  listFolders(): Promise<readonly FolderGrantView[]>;
  listLogs(): Promise<readonly LogEntry[]>;
  onLog(listener: (entry: LogEntry) => void): () => void;
  onSnapshot(listener: (snapshot: AgentSnapshot) => void): () => void;
  pair(input: PairDeviceInput): Promise<AgentSnapshot>;
  removeFolder(folderAliasId: string): Promise<readonly FolderGrantView[]>;
  setAutoStart(enabled: boolean): Promise<AgentSnapshot>;
  setExecutorRunning(running: boolean): Promise<AgentSnapshot>;
  setPrivacyMode(enabled: boolean): Promise<AgentSnapshot>;
  startUpdateCheck(): Promise<AgentSnapshot>;
}
