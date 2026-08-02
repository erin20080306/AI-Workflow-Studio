import { contextBridge, ipcRenderer } from 'electron';

import {
  IPC_CHANNELS,
  type AgentSnapshot,
  type DesktopAgentBridge,
  type FolderGrantView,
  type FolderPermissionInput,
  type LogEntry,
  type PairDeviceInput,
} from '../shared/contracts';

const bridge: DesktopAgentBridge = {
  chooseFolder: (permissions: FolderPermissionInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseFolder, permissions) as Promise<
      FolderGrantView | undefined
    >,
  clearSession: () => ipcRenderer.invoke(IPC_CHANNELS.clearSession) as Promise<AgentSnapshot>,
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.downloadUpdate) as Promise<AgentSnapshot>,
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getSnapshot) as Promise<AgentSnapshot>,
  listFolders: () =>
    ipcRenderer.invoke(IPC_CHANNELS.listFolders) as Promise<readonly FolderGrantView[]>,
  listLogs: () => ipcRenderer.invoke(IPC_CHANNELS.listLogs) as Promise<readonly LogEntry[]>,
  onLog(listener: (entry: LogEntry) => void) {
    const handler = (_event: Electron.IpcRendererEvent, entry: LogEntry) => listener(entry);
    ipcRenderer.on(IPC_CHANNELS.onLog, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.onLog, handler);
  },
  onSnapshot(listener: (snapshot: AgentSnapshot) => void) {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: AgentSnapshot) =>
      listener(snapshot);
    ipcRenderer.on(IPC_CHANNELS.onSnapshot, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.onSnapshot, handler);
  },
  pair: (input: PairDeviceInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.pair, input) as Promise<AgentSnapshot>,
  removeFolder: (folderAliasId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeFolder, folderAliasId) as Promise<
      readonly FolderGrantView[]
    >,
  setAutoStart: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setAutoStart, enabled) as Promise<AgentSnapshot>,
  setComputerUseEnabled: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setComputerUseEnabled, enabled) as Promise<AgentSnapshot>,
  setExecutorRunning: (running: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setExecutorRunning, running) as Promise<AgentSnapshot>,
  setPrivacyMode: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setPrivacyMode, enabled) as Promise<AgentSnapshot>,
  startUpdateCheck: () =>
    ipcRenderer.invoke(IPC_CHANNELS.startUpdateCheck) as Promise<AgentSnapshot>,
  takeOverComputerUse: () =>
    ipcRenderer.invoke(IPC_CHANNELS.takeOverComputerUse) as Promise<AgentSnapshot>,
};

contextBridge.exposeInMainWorld('desktopAgent', bridge);
