import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  sendAgentMessage(
    conversationId: string,
    content: string,
    workspaceId?: string,
    opts?: { regenerate?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    return ipcRenderer.invoke('agent:send', conversationId, content, workspaceId, opts) as Promise<{
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
  },
  onConversationTitleUpdated(
    callback: (data: { conversationId: string; title: string }) => void
  ): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { conversationId: string; title: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on('conversation:title-updated', handler)
    return () => ipcRenderer.removeListener('conversation:title-updated', handler)
  },
  // ── 认证 API ──
  loginByPassword(account: string, password: string) {
    return ipcRenderer.invoke('auth:login-password', account, password)
  },
  loginBySms(mobile: string, code: string) {
    return ipcRenderer.invoke('auth:login-sms', mobile, code)
  },
  sendSmsCode(mobile: string) {
    return ipcRenderer.invoke('auth:send-sms-code', mobile)
  },
  loginByWechat(code: string) {
    return ipcRenderer.invoke('auth:login-wechat', code)
  },
  logout(account: string) {
    return ipcRenderer.invoke('auth:logout', account)
  },
  // ── 会话 API（基于 LangGraph checkpointer）──
  listConversations() {
    return ipcRenderer.invoke('conversation:list')
  },
  getConversation(id: string) {
    return ipcRenderer.invoke('conversation:get', id)
  },
  deleteConversation(id: string) {
    return ipcRenderer.invoke('conversation:delete', id)
  },
  renameConversation(id: string, title: string) {
    return ipcRenderer.invoke('conversation:rename', id, title)
  },
  // ── 工作模式 API ──
  getWorkMode() {
    return ipcRenderer.invoke('mode:get')
  },
  setWorkMode(mode: string) {
    return ipcRenderer.invoke('mode:set', mode)
  },
  checkSession() {
    return ipcRenderer.invoke('session:check')
  },
  // ── 工作空间 API ──
  listWorkspaces() {
    return ipcRenderer.invoke('workspace:list')
  },
  createWorkspace(name: string) {
    return ipcRenderer.invoke('workspace:create', name)
  },
  selectWorkspaceDir() {
    return ipcRenderer.invoke('workspace:select-dir')
  },
  useDefaultWorkspace() {
    return ipcRenderer.invoke('workspace:default')
  },
  openWorkspace(id: string) {
    return ipcRenderer.invoke('workspace:open', id)
  },
  openDefaultWorkspace() {
    return ipcRenderer.invoke('workspace:open-default')
  },
  deleteWorkspace(id: string) {
    return ipcRenderer.invoke('workspace:delete', id)
  },
  listWorkspaceFiles(workspaceId: string, relPath?: string) {
    return ipcRenderer.invoke('workspace:list-files', workspaceId, relPath)
  },
  readWorkspaceFile(workspaceId: string, relPath: string) {
    return ipcRenderer.invoke('workspace:read-file', workspaceId, relPath)
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
