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

export interface Conversation {
  id: string
  userId: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface ConversationMessage {
  id: string
  conversationId: string
  role: string
  content: string
  reasoning?: string
  createdAt: number
}

export interface ConversationAPI {
  listConversations(): Promise<IpcResult<Conversation[]>>
  createConversation(title: string): Promise<IpcResult<Conversation>>
  getConversation(id: string): Promise<IpcResult<Conversation & { messages: ConversationMessage[] } | null>>
  updateConversationTitle(id: string, title: string): Promise<IpcResult<Conversation>>
  deleteConversation(id: string): Promise<IpcResult<null>>
  addConversationMessage(
    id: string,
    msg: { role: string; content: string; reasoning?: string }
  ): Promise<IpcResult<ConversationMessage>>
}

export interface ModeAPI {
  getWorkMode(): Promise<IpcResult<'local' | 'cloud'>>
  setWorkMode(mode: 'local' | 'cloud'): Promise<IpcResult<string>>
}

/** 渲染层可见的完整 API 形状 */
export interface KeWorkWindowApi extends AgentAPI, AuthAPI, ConversationAPI, ModeAPI {}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KeWorkWindowApi
  }
}
