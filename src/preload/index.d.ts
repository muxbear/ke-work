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
  /** 发送消息：conversationId 由渲染层生成，主进程按会话合成 thread_id 并读取历史 */
  sendAgentMessage(conversationId: string, content: string): Promise<{ success: boolean; error?: string }>
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

/** 会话列表项（基于 LangGraph checkpoint 派生：id 为会话 id，标题由首条消息派生） */
export interface Conversation {
  id: string
  title: string
  createAt: number
  updateAt: number
}

/** 会话内消息（checkpoint 不保存 reasoning，历史重开不展示思考过程） */
export interface ConversationMessage {
  id: string
  role: string
  content: string
}

export interface ConversationAPI {
  listConversations(): Promise<IpcResult<Conversation[]>>
  getConversation(id: string): Promise<IpcResult<{ id: string; messages: ConversationMessage[] }>>
  deleteConversation(id: string): Promise<IpcResult<null>>
}

export interface ModeAPI {
  getWorkMode(): Promise<IpcResult<'local' | 'cloud'>>
  setWorkMode(mode: 'local' | 'cloud'): Promise<IpcResult<string>>
  /** 校验主进程会话（localStorage token 可能残留，主进程为权威） */
  checkSession(): Promise<IpcResult<{ loggedIn: boolean }>>
}

/** 渲染层可见的完整 API 形状 */
export interface KeWorkWindowApi extends AgentAPI, AuthAPI, ConversationAPI, ModeAPI {}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KeWorkWindowApi
  }
}
