import { ElectronAPI } from '@electron-toolkit/preload'

/** IPC 统一结果包裹（与主进程 auth-handlers 一致） */
export interface IpcResult<T> {
  success: boolean
  data?: T
  error?: string
}

export interface AuthResult {
  token: string
  refreshToken: string
  user: { id: string; username: string; mobile?: string }
}

export interface AgentAPI {
  openExternal: (url: string) => Promise<void>
  openWeChatAuth: (
    authUrl: string,
    redirectUri: string
  ) => Promise<{ code?: string; error?: string }>
  sendAgentMessage(
    messages: Array<{ role: string; content: string }>
  ): Promise<{ success: boolean; error?: string }>
  cancelAgentMessage(): void
  onAgentChunk(callback: (chunk: string) => void): () => void
  onAgentThinking(callback: (chunk: string) => void): () => void
  onAgentThinkingDone(callback: () => void): () => void
  onAgentDone(callback: () => void): () => void
}

export interface AuthAPI {
  loginByPassword(account: string, password: string): Promise<IpcResult<AuthResult>>
  loginBySms(mobile: string, code: string): Promise<IpcResult<AuthResult>>
  sendSmsCode(mobile: string): Promise<IpcResult<null>>
  loginByWechat(code: string): Promise<IpcResult<AuthResult>>
  logout(account: string): Promise<IpcResult<null>>
}

/** 渲染层可见的完整 API 形状 */
export interface KeWorkWindowApi extends AgentAPI, AuthAPI {}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KeWorkWindowApi
  }
}
