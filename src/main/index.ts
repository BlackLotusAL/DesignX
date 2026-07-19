import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  safeStorage,
  session,
  shell,
} from 'electron';
import { IPC_CHANNELS } from '../shared/contracts';
import { ApplicationService } from './application-service';
import { registerIpc } from './ipc/register-ipc';
import { CredentialStore } from './security/credential-store';
import { AnalysisService } from './services/analysis/analysis-service';
import { GitService } from './services/git/git-service';
import { KnowledgeService } from './services/knowledge/knowledge-service';
import { ModelService } from './services/model/model-service';
import { WorkspaceService } from './services/workspace/workspace-service';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const rendererDevelopmentUrl = process.env.ELECTRON_RENDERER_URL;
const packageVerification = process.argv.includes('--designx-package-verify');
const singleInstance = app.requestSingleInstanceLock();

app.enableSandbox();

if (!singleInstance) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  let disposeIpc: (() => void) | null = null;
  let application: ApplicationService | null = null;

  function createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1280,
      minHeight: 720,
      backgroundColor: '#ffffff',
      title: 'DesignX',
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#ffffff',
        symbolColor: '#15171b',
        height: 38,
      },
      webPreferences: {
        preload: join(currentDirectory, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    window.setMenuBarVisibility(false);
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (url !== window.webContents.getURL()) event.preventDefault();
    });
    window.webContents.on('will-redirect', (event) => event.preventDefault());
    window.once('ready-to-show', () => window.show());
    return window;
  }

  function installMenu(window: BrowserWindow): void {
    const menu = Menu.buildFromTemplate([
      {
        label: '文件',
        submenu: [
          {
            label: '切换工作区…',
            accelerator: 'CmdOrCtrl+Shift+O',
            click: async () => {
              const selection = await application?.workspaceSelect();
              if (selection) window.webContents.reload();
            },
          },
          { type: 'separator' },
          { role: 'quit', label: '退出' },
        ],
      },
      {
        label: '视图',
        submenu: [{ role: 'reload', label: '重新加载' }],
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '关于 DesignX',
            click: () =>
              dialog.showMessageBox(window, {
                type: 'info',
                title: '关于 DesignX',
                message: 'DesignX',
                detail: `本地研发治理工作台\n版本 ${app.getVersion()}`,
              }),
          },
        ],
      },
    ]);
    Menu.setApplicationMenu(menu);
  }

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);

    mainWindow = createWindow();
    installMenu(mainWindow);

    const development = !app.isPackaged;
    const events = new EventEmitter();
    const credentialStore = new CredentialStore(
      app.getPath('userData'),
      safeStorage,
      development ? process.env.DESIGNX_MODEL_API_KEY : undefined,
    );
    const git = new GitService(development || process.env.DESIGNX_E2E === '1');
    const knowledge = new KnowledgeService(process.env.NODE_ENV === 'test');
    const workspace = new WorkspaceService(
      app.getPath('userData'),
      credentialStore,
      git,
      app.isPackaged,
      {
        workspace: process.env.DESIGNX_DEV_WORKSPACE,
        apiUrl: process.env.DESIGNX_MODEL_BASE_URL,
        model: process.env.DESIGNX_MODEL_NAME,
        credential: process.env.DESIGNX_MODEL_API_KEY,
      },
    );
    const model = new ModelService({
      fetch: (input, init) => net.fetch(input.toString(), init),
      allowLocalhostHttp: development,
      cacheMode: async (baseUrl, mode) => {
        await workspace.currentStore().cacheStructuredOutputMode(baseUrl, mode);
      },
    });
    const analysis = new AnalysisService({
      git,
      knowledge,
      model,
      connection: () => workspace.modelConnection(),
      log: (store) => workspace.logService(store),
      onTaskUpdated: (task) =>
        events.emit(IPC_CHANNELS.eventTaskUpdated, { task }),
      onRepositoryUpdated: async (repositoryId, store) => {
        events.emit(IPC_CHANNELS.eventRepositoryUpdated, {
          repository: await store.repository(repositoryId),
        });
      },
    });
    application = new ApplicationService(
      workspace,
      git,
      knowledge,
      analysis,
      model,
      dialog,
      () => mainWindow,
      events,
    );
    disposeIpc = registerIpc(ipcMain, mainWindow, application, events);
    await application.workspaceBootstrap();

    if (packageVerification) {
      mainWindow.webContents.once('did-finish-load', () => {
        setTimeout(() => app.quit(), 500);
      });
    }
    if (rendererDevelopmentUrl) {
      await mainWindow.loadURL(rendererDevelopmentUrl);
    } else {
      await mainWindow.loadFile(join(currentDirectory, '../renderer/index.html'));
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
        installMenu(mainWindow);
      }
    });
  });

  app.on('before-quit', () => {
    disposeIpc?.();
    disposeIpc = null;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
