import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { invokeSendMessage } from './agent/service'

import icon from '../../resources/icon.png?asset'

import 'dotenv/config'

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
