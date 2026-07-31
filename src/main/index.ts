import { app, shell, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { invokeSendMessage } from './agent/service'
import { detectOS } from './platform'
import { getDataDirectory, initDataDirectory } from './data-dir'
import { WorkModeStore } from './mode/work-mode'
import { DataSourceFactory } from './database/DataSourceFactory'
import { AuthService } from './services/AuthService'
import { SessionService } from './services/SessionService'
import { ElectronSafeStorage } from './security/secure-storage'
import { registerAuthHandlers } from './ipc/auth-handlers'
import { AgentManager } from './agent/AgentManager'
import { ConversationService } from './services/ConversationService'
import { registerConversationHandlers } from './ipc/conversation-handlers'
import { registerModeHandlers } from './ipc/mode-handlers'

import icon from '../../resources/icon.png?asset'

import 'dotenv/config'

// 测试/多实例隔离：允许通过环境变量覆盖 Electron 用户数据目录（localStorage 等）
if (process.env.KE_WORK_USER_DATA) {
  app.setPath('userData', process.env.KE_WORK_USER_DATA)
}

// 取消控制器映射（按窗口 ID）
const abortControllers = new Map<number, AbortController>()

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    fullscreenable: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.maximize()

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // 检测操作系统类型并初始化数据目录
  detectOS()
  initDataDirectory()

  // ── 初始化工作模式 ──
  const dataDir = getDataDirectory()
  const workModeStore = new WorkModeStore(dataDir.getDir('config'))
  const mode = workModeStore.getMode()

  // ── 初始化数据源工厂 ──
  const dataSourceFactory = DataSourceFactory.getInstance()
  dataSourceFactory.configure({
    localDbPath: join(dataDir.getBaseDir(), 'ke-work.db'),
    cloudBaseUrl: process.env.CLOUD_API_BASE_URL ?? ''
  })
  dataSourceFactory.setMode(mode)

  // ── 初始化安全存储与 JWT 密钥 ──
  const secureStorage = new ElectronSafeStorage(
    join(dataDir.getDir('config'), 'secrets.bin'),
    safeStorage
  )
  let jwtSecret = secureStorage.get('jwt-secret')
  if (!jwtSecret) {
    jwtSecret = randomBytes(32).toString('hex')
    secureStorage.set('jwt-secret', jwtSecret)
  }

  // ── 初始化认证服务与会话 ──
  const authService = new AuthService({
    repository: dataSourceFactory.createAuthRepository(),
    jwtSecret,
    secureStorage
  })
  const session = new SessionService(dataDir.getDir('config'))

  // ── 注册认证 IPC ──
  registerAuthHandlers(ipcMain, { authService, dataSourceFactory, session })

  // ── 初始化智能体（AgentManager）──
  const agentManager = new AgentManager(dataDir.getDir('workspace'))
  agentManager
    .init(mode)
    .catch((err) => console.error('[main] agent init failed:', err))

  // ── 注册会话 IPC ──
  const conversationService = new ConversationService(
    dataSourceFactory.createConversationRepository()
  )
  registerConversationHandlers(ipcMain, { conversationService, session })

  // ── 注册工作模式 IPC ──
  registerModeHandlers(ipcMain, {
    modeStore: workModeStore,
    dataSourceFactory,
    agentManager,
    authService,
    session
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('open-external', async (_, url: string) => {
    await shell.openExternal(url)
  })

  // Agent message handler
  ipcMain.handle(
    'agent:send',
    async (event, messages: Array<{ role: string; content: string }>) => {
      console.log('[main] agent:send handler, messages count:', messages?.length)
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) {
        console.error('[main] No window found for event.sender')
        throw new Error('No window found')
      }

      const controller = new AbortController()
      abortControllers.set(win.id, controller)

      try {
        await invokeSendMessage(messages, win, controller.signal)
        console.log('[main] invokeSendMessage completed, returning success')
        return { success: true }
      } catch (error) {
        console.error('[main] Error handling message:', error)
        return { success: false, error: (error as Error).message || 'Unknown error' }
      } finally {
        abortControllers.delete(win.id)
      }
    }
  )

  // Agent cancel handler
  ipcMain.on('agent:cancel', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const controller = abortControllers.get(win.id)
      controller?.abort()
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
