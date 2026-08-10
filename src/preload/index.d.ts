import { ElectronAPI } from '@electron-toolkit/preload'

/** IPC 统一结果包裹（与主进程 auth-handlers 一致） */
export interface IpcResult<T> {
  success: boolean
  data?: T
  error?: string
}

/** 输入消息部件：纯文本段或文件引用（路径；文件内容由主进程权威读取） */
export interface MessageTextPart {
  type: 'text'
  text: string
}
export interface MessageFilePart {
  type: 'file'
  path: string
}
export type MessagePart = MessageTextPart | MessageFilePart

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
  /** 发送消息：conversationId 由渲染层生成，主进程按会话合成 thread_id 并读取历史；parts 为保序消息部件（文本段 + 文件引用）或纯文本字符串；workspaceId 为当前任务选择的工作空间；regenerate 表示重新生成最后一条回复（主进程截断旧回复）；customModelId 为自定义模型 id（缺省用默认模型，主进程校验归属） */
  sendAgentMessage(
    conversationId: string,
    parts: MessagePart[] | string,
    workspaceId?: string,
    opts?: { regenerate?: boolean; model?: string; customModelId?: string }
  ): Promise<{ success: boolean; error?: string }>
  cancelAgentMessage(): void
  onAgentChunk(callback: (chunk: string) => void): () => void
  onAgentThinking(callback: (chunk: string) => void): () => void
  onAgentThinkingDone(callback: () => void): () => void
  onAgentDone(callback: () => void): () => void
  /** 选中文件即时校验（存在性 + 类型分类 + 大小），返回 kind: text/image/pdf/unsupported/missing */
  inspectFile(path: string): Promise<IpcResult<{
    exists: boolean
    size: number
    kind: 'text' | 'image' | 'pdf' | 'unsupported' | 'missing'
  }>>
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

/** 会话内消息（checkpoint 中 AI 消息为消息块结构，reasoning 块提取为深度思考） */
export interface ConversationMessage {
  id: string
  role: string
  content: string
  reasoning?: string
}

export interface ConversationAPI {
  listConversations(): Promise<IpcResult<Conversation[]>>
  getConversation(id: string): Promise<IpcResult<{ id: string; messages: ConversationMessage[] }>>
  deleteConversation(id: string): Promise<IpcResult<null>>
  /** 重命名会话（自定义标题，列表读取时优先） */
  renameConversation(id: string, title: string): Promise<IpcResult<null>>
  /** 监听 AI 总结标题异步生成完成（主进程推送，侧栏即时刷新） */
  onConversationTitleUpdated(
    callback: (data: { conversationId: string; title: string }) => void
  ): () => void
}

export interface ModeAPI {
  getWorkMode(): Promise<IpcResult<'local' | 'cloud'>>
  setWorkMode(mode: 'local' | 'cloud'): Promise<IpcResult<string>>
  /** 校验主进程会话（localStorage token 可能残留，主进程为权威） */
  checkSession(): Promise<IpcResult<{ loggedIn: boolean }>>
}

/** 工作空间（workspaces 表行；source: created=新建 / external=打开本地文件夹 / timestamp=旧版时间戳 / default=默认工作空间；userId 为 null 表示机器级共享的默认空间） */
export interface Workspace {
  id: string
  name: string
  path: string
  source: 'created' | 'external' | 'timestamp' | 'default'
  userId: string | null
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
  /** 使用默认工作空间：~/KeWork/DefaultWorkspace（未选择任何空间时的兜底） */
  useDefaultWorkspace(): Promise<IpcResult<Workspace>>
  openWorkspace(id: string): Promise<IpcResult<null>>
  /** 打开默认工作目录（~/.ke-work/workspace，未绑定空间的会话使用） */
  openDefaultWorkspace(): Promise<IpcResult<null>>
  /** 从列表中删除工作空间（仅删记录，不动磁盘文件夹） */
  deleteWorkspace(id: string): Promise<IpcResult<null>>
  /** 列出工作空间下相对路径目录的条目（顶层传空串） */
  listWorkspaceFiles(
    workspaceId: string,
    relPath?: string
  ): Promise<IpcResult<WorkspaceFileEntry[]>>
  /** 读取工作空间下文件文本内容 */
  readWorkspaceFile(workspaceId: string, relPath: string): Promise<IpcResult<WorkspaceFileContent>>
}

/** ~/.ke-work 存储统计（config:storage-stats） */
export interface StorageStats {
  baseDir: string
  usedBytes: number
  diskTotal: number
  diskFree: number
  /** 统计超时降级（仅统计了部分目录） */
  partial?: boolean
}

/** 系统设置快照（config:get-all；settings 为扁平 key 映射，meta 供 UI 显示真实值） */
export interface SettingsSnapshot {
  settings: Record<string, unknown>
  meta: { dataBaseDir: string; workspaceBaseDir: string }
}

export interface ConfigAPI {
  /** 全局字体缩放（webFrame.setZoomFactor 封装；渲染层不直接 import electron） */
  setZoomFactor(ratio: number): void
  /** 读取全部系统设置（默认值合并；机器级，不依赖登录态） */
  getAllSettings(): Promise<IpcResult<SettingsSnapshot>>
  /** 修改单项设置（主进程校验：白名单 + 类型/枚举/格式/区间；非法返回 error） */
  setSetting(key: string, value: unknown): Promise<IpcResult<null>>
  /** ~/.ke-work 目录占用真实统计 + 磁盘容量 */
  getStorageStats(): Promise<IpcResult<StorageStats>>
  /** 系统目录选择对话框；用户取消时 data 为 null */
  selectDefaultWorkspaceDir(): Promise<IpcResult<string | null>>
  /** 在系统资源管理器中打开 ~/.ke-work */
  openDataDir(): Promise<IpcResult<null>>
}

/** 自定义模型记录（models.json 元素；id 即 API 模型标识，name 为显示名） */
export interface CustomModel {
  id: string
  name: string
  vendor: string
  url: string
  apiKey: string
  supportsToolCall: boolean
  supportsImages: boolean
  supportsReasoning: boolean
  reasoning?: { defaultEffort: string; supportedEfforts: string[] }
}

/** 提供商（models.json 内 providers 元素；plans 为提供方式列表，models 为该家可提供的模型） */
export interface ModelProvider {
  id: string
  /** 提供商中文名（如 深度求索） */
  name: string
  /** 提供商英文名（如 DeepSeek；无则不显示） */
  nameEn?: string
  /** LOGO 标识（ProviderLogo 组件按此渲染） */
  logo: string
  defaultUrl: string
  plans: { type: string }[]
  /** 该提供商可提供的模型列表（模型名称下拉数据源） */
  models: string[]
}

export interface ModelAPI {
  /** 全部自定义模型 */
  listModels(): Promise<IpcResult<CustomModel[]>>
  /** 添加自定义模型（主进程校验：id 唯一、url 格式等；失败返回 error） */
  addModel(input: {
    id: string
    name: string
    vendor: string
    url: string
    apiKey: string
  }): Promise<IpcResult<CustomModel>>
  /** 移除自定义模型（幂等） */
  removeModel(id: string): Promise<IpcResult<null>>
  /** 更新自定义模型（按 id 定位；id 本身不可改，其余字段可改） */
  updateModel(
    id: string,
    input: { id: string; name: string; vendor: string; url: string; apiKey: string }
  ): Promise<IpcResult<CustomModel>>
  /** 提供商列表（models.json 内 providers；缺失时主进程用内置种子） */
  listModelProviders(): Promise<IpcResult<ModelProvider[]>>
}

/** 渲染层可见的完整 API 形状 */
export interface KeWorkWindowApi
  extends AgentAPI, AuthAPI, ConversationAPI, ModeAPI, WorkspaceAPI, ConfigAPI, ModelAPI {}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KeWorkWindowApi
  }
}
