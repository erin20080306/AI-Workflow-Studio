import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  safeStorage,
  session,
  Tray,
  type IpcMainInvokeEvent,
} from 'electron';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import {
  IPC_CHANNELS,
  type AgentSnapshot,
  type FolderPermissionInput,
  type PairDeviceInput,
} from '../shared/contracts';
import { ProcessingLedger } from '@ai-workflow-studio/local-executor';
import { AgentClient, type AgentClientStatus } from './agent-client';
import { FolderGrantStore } from './folder-grants';
import { DesktopSpreadsheetExecutor } from './local-executor';
import { StructuredLogger } from './logger';
import { SettingsStore, type DesktopSettings } from './settings-store';
import { TokenVault, type SecureCipher } from './token-vault';
import { ManualUpdateController } from './updater';

protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
    scheme: 'aiws',
  },
]);

const PairInputSchema = z
  .object({
    agentBaseUrl: z.string().trim().min(1).max(500),
    pairingCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/),
  })
  .strict();
const FolderPermissionSchema = z
  .object({
    read: z.boolean(),
    watch: z.boolean(),
    write: z.boolean(),
  })
  .strict();
const UuidSchema = z.string().uuid();

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let isQuitting = false;
let settings: DesktopSettings = { autoStart: false, privacyMode: true };
let agentStatus: AgentClientStatus = {
  connection: 'unpaired',
  paired: false,
  pendingJobCount: 0,
};
let logger: StructuredLogger;
let agentClient: AgentClient;
let folderGrants: FolderGrantStore;
let spreadsheetExecutor: DesktopSpreadsheetExecutor;
let settingsStore: SettingsStore;
let updater: ManualUpdateController;

function currentSnapshot(): AgentSnapshot {
  return {
    agentVersion: app.getVersion(),
    autoStart: settings.autoStart,
    connection: agentStatus.connection,
    ...(agentStatus.deviceName === undefined ? {} : { deviceName: agentStatus.deviceName }),
    executorRunning: agentClient?.isExecutorRunning() ?? false,
    ...(agentStatus.lastHeartbeatAt === undefined
      ? {}
      : { lastHeartbeatAt: agentStatus.lastHeartbeatAt }),
    paired: agentStatus.paired,
    pendingJobCount: agentStatus.pendingJobCount,
    privacyMode: settings.privacyMode,
    update: updater?.getState() ?? {
      downloaded: false,
      message: '尚未檢查更新',
      status: 'idle',
    },
  };
}

function broadcastSnapshot(): void {
  if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.onSnapshot, currentSnapshot());
  }
  updateTrayMenu();
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (
    mainWindow === undefined ||
    mainWindow.isDestroyed() ||
    event.sender.id !== mainWindow.webContents.id
  ) {
    throw new Error('Untrusted IPC sender.');
  }
}

function safeIpc<TInput extends readonly unknown[], TResult>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...input: TInput) => Promise<TResult> | TResult,
): void {
  ipcMain.handle(channel, async (event, ...input: TInput) => {
    try {
      assertTrustedSender(event);
      return await handler(event, ...input);
    } catch (error) {
      logger.warn('IPC_REQUEST_REJECTED', 'Desktop request was rejected.', {
        channel,
        type: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new Error('Desktop Agent request could not be completed.', { cause: error });
    }
  });
}

function secureCipher(): SecureCipher {
  return {
    async decrypt(encrypted) {
      const result = await safeStorage.decryptStringAsync(encrypted);
      return {
        result: result.result,
        shouldReEncrypt: result.shouldReEncrypt,
      };
    },
    encrypt: (plainText) => safeStorage.encryptStringAsync(plainText),
    async isAvailable() {
      const available = await safeStorage.isAsyncEncryptionAvailable();
      if (
        process.platform === 'linux' &&
        safeStorage.getSelectedStorageBackend() === 'basic_text'
      ) {
        return false;
      }
      return available;
    },
  };
}

function registerIpc(): void {
  safeIpc(IPC_CHANNELS.getSnapshot, () => currentSnapshot());
  safeIpc(IPC_CHANNELS.listLogs, () => logger.list());
  safeIpc(IPC_CHANNELS.listFolders, async () => {
    const deviceId = agentClient.getSession()?.deviceId;
    return deviceId === undefined ? [] : folderGrants.list(deviceId);
  });
  safeIpc(IPC_CHANNELS.pair, async (_event, input: PairDeviceInput) => {
    const request = PairInputSchema.parse(input);
    await agentClient.pair(request.agentBaseUrl, request.pairingCode);
    broadcastSnapshot();
    return currentSnapshot();
  });
  safeIpc(IPC_CHANNELS.setExecutorRunning, async (_event, running: boolean) => {
    z.boolean().parse(running);
    if (running) {
      agentClient.start();
    } else {
      agentClient.stop();
    }
    broadcastSnapshot();
    return currentSnapshot();
  });
  safeIpc(IPC_CHANNELS.clearSession, async () => {
    await agentClient.clearSession();
    broadcastSnapshot();
    return currentSnapshot();
  });
  safeIpc(IPC_CHANNELS.chooseFolder, async (_event, permissionInput: FolderPermissionInput) => {
    const permissions = FolderPermissionSchema.parse(permissionInput);
    const deviceId = agentClient.getSession()?.deviceId;
    if (deviceId === undefined) {
      throw new Error('Pair the device before authorizing a folder.');
    }
    const ownerWindow = mainWindow;
    if (ownerWindow === undefined) {
      throw new Error('Desktop window is unavailable.');
    }
    const selected = await dialog.showOpenDialog(ownerWindow, {
      buttonLabel: '授權此資料夾',
      properties: ['openDirectory', 'createDirectory'],
      title: '選擇 Desktop Agent 可存取的資料夾',
    });
    const selectedPath = selected.filePaths[0];
    if (selected.canceled || selectedPath === undefined) {
      return undefined;
    }
    const grant = await folderGrants.authorize(selectedPath, deviceId, permissions);
    logger.info('FOLDER_AUTHORIZED', 'A local folder alias was authorized.', {
      folderAliasId: grant.folderAliasId,
      permissions: grant.permissions,
    });
    return grant;
  });
  safeIpc(IPC_CHANNELS.removeFolder, async (_event, folderAliasId: string) => {
    const aliasId = UuidSchema.parse(folderAliasId);
    const deviceId = agentClient.getSession()?.deviceId;
    if (deviceId === undefined) {
      throw new Error('Pair the device before changing folder permissions.');
    }
    const grants = await folderGrants.remove(aliasId, deviceId);
    logger.info('FOLDER_REVOKED', 'A local folder alias permission was removed.', {
      folderAliasId: aliasId,
    });
    return grants;
  });
  safeIpc(IPC_CHANNELS.setPrivacyMode, async (_event, enabled: boolean) => {
    settings = await settingsStore.save({
      ...settings,
      privacyMode: z.boolean().parse(enabled),
    });
    broadcastSnapshot();
    return currentSnapshot();
  });
  safeIpc(IPC_CHANNELS.setAutoStart, async (_event, enabled: boolean) => {
    const autoStart = z.boolean().parse(enabled);
    app.setLoginItemSettings({
      openAtLogin: autoStart,
      openAsHidden: autoStart,
    });
    settings = await settingsStore.save({ ...settings, autoStart });
    broadcastSnapshot();
    return currentSnapshot();
  });
  safeIpc(IPC_CHANNELS.startUpdateCheck, async () => {
    await updater.check();
    return currentSnapshot();
  });
  safeIpc(IPC_CHANNELS.downloadUpdate, async () => {
    await updater.download();
    return currentSnapshot();
  });
}

function rendererRoot(): string {
  return join(__dirname, '..', 'renderer');
}

async function registerRendererProtocol(): Promise<void> {
  const root = rendererRoot();
  await protocol.handle('aiws', (request) => {
    const url = new URL(request.url);
    const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = resolve(root, `.${requestedPath}`);
    const containment = relative(root, target);
    if (containment.startsWith('..') || containment === '..') {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    backgroundColor: '#f7f8fc',
    height: 820,
    minHeight: 680,
    minWidth: 900,
    show: false,
    title: 'AI Workflow Studio Agent',
    webPreferences: {
      contextIsolation: true,
      devTools: !app.isPackaged,
      nodeIntegration: false,
      preload: join(__dirname, '..', 'preload', 'preload.cjs'),
      sandbox: true,
      webSecurity: true,
    },
    width: 1180,
  });
  window.once('ready-to-show', () => window.show());
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl.startsWith('aiws://bundle/')) {
      event.preventDefault();
    }
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  void window.loadURL('aiws://bundle/index.html');
  return window;
}

function createTray(): Tray {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" rx="4" fill="#4f46e5"/><path d="M5 9h3l1-3 2 6 1-3h1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  );
  image.setTemplateImage(process.platform === 'darwin');
  const nextTray = new Tray(image);
  nextTray.setToolTip('AI Workflow Studio Agent');
  nextTray.on('click', () => {
    mainWindow?.show();
  });
  return nextTray;
}

function updateTrayMenu(): void {
  if (tray === undefined) {
    return;
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label:
          agentStatus.connection === 'online'
            ? 'Agent 在線'
            : agentStatus.paired
              ? 'Agent 離線'
              : '尚未配對',
        enabled: false,
      },
      {
        click: () => mainWindow?.show(),
        label: '開啟控制台',
      },
      { type: 'separator' },
      {
        click: () => {
          isQuitting = true;
          app.quit();
        },
        label: '結束 Agent',
      },
    ]),
  );
}

async function initialize(): Promise<void> {
  const userData = app.getPath('userData');
  logger = new StructuredLogger(join(app.getPath('logs'), 'agent.jsonl'));
  await logger.restore();
  settingsStore = new SettingsStore(join(userData, 'settings.json'));
  settings = await settingsStore.load();
  folderGrants = new FolderGrantStore(join(userData, 'folder-grants.json'));
  spreadsheetExecutor = new DesktopSpreadsheetExecutor(
    folderGrants,
    new ProcessingLedger(join(userData, 'processing-ledger.json')),
  );
  const vault = new TokenVault(join(userData, 'device-session.enc'), secureCipher());
  updater = new ManualUpdateController(app.isPackaged, logger, () => broadcastSnapshot());
  agentClient = new AgentClient({
    agentVersion: app.getVersion(),
    logger,
    onStatus: (status) => {
      agentStatus = status;
      broadcastSnapshot();
    },
    vault,
  });
  await agentClient.initialize();
  await registerRendererProtocol();
  mainWindow = createWindow();
  tray = createTray();
  logger.onEntry((entry) => {
    if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.onLog, entry);
    }
  });
  registerIpc();
  updateTrayMenu();
  logger.info('AGENT_READY', 'Desktop Agent is ready.', {
    capabilities: spreadsheetExecutor.capabilities(),
    packaged: app.isPackaged,
    platform: process.platform,
    version: app.getVersion(),
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  void app
    .whenReady()
    .then(async () => {
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
      });
      await initialize();
    })
    .catch(() => {
      dialog.showErrorBox(
        'AI Workflow Studio Agent',
        'The desktop agent could not start. Review the local agent logs for details.',
      );
      app.exit(1);
    });
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

app.on('activate', () => {
  mainWindow?.show();
});

app.on('before-quit', () => {
  isQuitting = true;
  agentClient?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Tray keeps the Agent alive until the explicit Quit action.
  }
});
