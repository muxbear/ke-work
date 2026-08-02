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
  /** 发送消息：conversationId 由渲染层生成，主进程按会话合成 thread_id 并读取历史；workspaceId 为当前任务选择的工作空间；regenerate 表示重新生成最后一条回复（主进程截断旧回复） */
  sendAgentMessage(
    conversationId: string,
    content: string,
    workspaceId?: string,
    opts?: { regenerate?: boolean }
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

/** 会话绑定的工作空间（checkpoint metadata 派生；无绑定为 undefined，归"默认空间"） */
export interface ConversationWorkspace {
  id: string
  name: string
  dir?: string
}

/** 会话列表项（基于 LangGraph checkpoint 派生：id 为会话 id，标题由首条消息派生） */
export interface Conversation {
  id: string
  title: string
  createAt: number
  updateAt: number
  workspace?: ConversationWorkspace | null
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

/** 工作空间（workspaces 表行；source: created=新建 / external=打开本地文件夹 / timestamp=不使用工作空间） */
export interface Workspace {
  id: string
  name: string
  path: string
  source: 'created' | 'external' | 'timestamp'
  createdAt: number
}

/** 工作空间文件列表条目（relPath 为 '/' 分隔的相对路径） */
export interface WorkspaceFileEntry {
  name: string
  type: 'dir' | 'file'
  relPath: string
}

/** 工作空间文件内容（truncated 表示超过预览上限被截断） */
export interface WorkspaceFileContent {
  content: string
  truncated: boolean
}

export interface WorkspaceAPI {
  listWorkspaces(): Promise<IpcResult<Workspace[]>>
  createWorkspace(name: string): Promise<IpcResult<Workspace>>
  /** 打开系统目录选择窗口；用户取消时 data 为 null */
  selectWorkspaceDir(): Promise<IpcResult<Workspace | null>>
  /** 不使用工作空间：~/KeWork/<YYYYMMDD-HHmmss> 时间戳目录 */
  useTimestampWorkspace(): Promise<IpcResult<Workspace>>
  openWorkspace(id: string): Promise<IpcResult<null>>
  /** 列出工作空间下相对路径目录的条目（顶层传空串） */
  listWorkspaceFiles(
    workspaceId: string,
    relPath?: string
  ): Promise<IpcResult<WorkspaceFileEntry[]>>
  /** 读取工作空间下文件文本内容 */
  readWorkspaceFile(workspaceId: string, relPath: string): Promise<IpcResult<WorkspaceFileContent>>
}

/** 渲染层可见的完整 API 形状 */
export interface KeWorkWindowApi
  extends AgentAPI,
    AuthAPI,
    ConversationAPI,
    ModeAPI,
    WorkspaceAPI {}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KeWorkWindowApi
  }
}
