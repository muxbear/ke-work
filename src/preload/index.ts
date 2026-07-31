import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  sendAgentMessage(
    messages: Array<{ role: string; content: string }>
  ): Promise<{ success: boolean; error?: string }> {
    return ipcRenderer.invoke('agent:send', messages) as Promise<{
      success: boolean
      error?: string
    }>
  },
  cancelAgentMessage(): void {
    ipcRenderer.send('agent:cancel')
  },
  onAgentChunk(callback: (chunk: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string): void => {
      callback(chunk)
    }
    ipcRenderer.on('agent:stream-chunk', handler)
    return () => ipcRenderer.removeListener('agent:stream-chunk', handler)
  },
  onAgentThinking(callback: (chunk: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string): void => {
      callback(chunk)
    }
    ipcRenderer.on('agent:stream-thinking', handler)
    return () => ipcRenderer.removeListener('agent:stream-thinking', handler)
  },
  onAgentThinkingDone(callback: () => void): () => void {
    ipcRenderer.on('agent:stream-thinking-done', callback)
    return () => ipcRenderer.removeListener('agent:stream-thinking-done', callback)
  },
  onAgentDone(callback: () => void): () => void {
    ipcRenderer.on('agent:stream-done', callback)
    return () => ipcRenderer.removeListener('agent:stream-done', callback)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
