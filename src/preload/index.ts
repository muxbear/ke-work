import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  sendAgentMessage(
    conversationId: string,
    parts: ({ type: 'text'; text: string } | { type: 'file'; path: string })[] | string,
    workspaceId?: string,
    opts?: { regenerate?: boolean; model?: string; customModelId?: string }
  ): Promise<{ success: boolean; error?: string }> {
    return ipcRenderer.invoke('agent:send', conversationId, parts, workspaceId, opts) as Promise<{
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
  // ── 文件附件 API ──
  inspectFile(path: string) {
    return ipcRenderer.invoke('file:inspect', path)
  },
  /** 获取文件选择器选中文件的绝对路径（Electron 39 已移除 File.path，须走 webUtils） */
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
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
  },
  // ── 系统设置 API（机器级配置）──
  /** 全局字体缩放（webFrame.setZoomFactor；渲染层不直接 import electron） */
  setZoomFactor(ratio: number) {
    webFrame.setZoomFactor(ratio)
  },
  getAllSettings() {
    return ipcRenderer.invoke('config:get-all')
  },
  setSetting(key: string, value: unknown) {
    return ipcRenderer.invoke('config:set', key, value)
  },
  getStorageStats() {
    return ipcRenderer.invoke('config:storage-stats')
  },
  selectDefaultWorkspaceDir() {
    return ipcRenderer.invoke('config:select-workspace-dir')
  },
  openDataDir() {
    return ipcRenderer.invoke('config:open-data-dir')
  },
  // ── 自定义模型 API（机器级配置）──
  listModels() {
    return ipcRenderer.invoke('model:list')
  },
  addModel(input: { id: string; name: string; vendor: string; url: string; apiKey: string }) {
    return ipcRenderer.invoke('model:add', input)
  },
  removeModel(id: string) {
    return ipcRenderer.invoke('model:remove', id)
  },
  updateModel(
    id: string,
    input: { id: string; name: string; vendor: string; url: string; apiKey: string }
  ) {
    return ipcRenderer.invoke('model:update', id, input)
  },
  listModelProviders() {
    return ipcRenderer.invoke('model:list-providers')
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
