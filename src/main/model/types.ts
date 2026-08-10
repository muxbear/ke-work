/**
 * 自定义模型与提供商数据契约（合并存储于 ~/.ke-work/models.json，机器级，与登录态无关）
 *
 * 磁盘格式：
 * {
 *   "version": 1,
 *   "providers": [...],   // 提供商下拉数据源（缺失/未定义时用内置种子）
 *   "models": [...]       // 用户自定义模型（apiKey 明文存储，与 .env 现状一致）
 * }
 *
 * 兼容：v1 早期版本 models.json 为顶层数组（仅模型），加载时自动识别迁移
 */

/** 用户自定义模型记录（models.json 元素，apiKey 明文存储，与 .env 现状一致） */
export interface ModelRecord {
  /** 模型唯一标识（弹窗输入值即 API 模型标识，如 deepseek-v4-flash / gpt-4o） */
  id: string
  /** 显示名（列表/聊天下拉展示；默认同 id，可手改 json 美化） */
  name: string
  /** 提供商名称（如 DeepSeek / 智谱） */
  vendor: string
  /** OpenAI 兼容 chat/completions 端点 */
  url: string
  apiKey: string
  supportsToolCall: boolean
  supportsImages: boolean
  supportsReasoning: boolean
  /** 推理模型参数（可选，省略时使用默认） */
  reasoning?: {
    defaultEffort: string
    supportedEfforts: string[]
  }
}

/** 添加模型入参（渲染层 → IPC，主进程校验权威） */
export interface AddModelInput {
  id: string
  name: string
  vendor: string
  url: string
  apiKey: string
}

/** 提供商提供方式 */
export type ProviderPlanType = 'Token Plan' | 'Coding Plan' | '自定义 API' | '其它'

/** 提供商记录（models.json 内 providers 元素） */
export interface ProviderRecord {
  id: string
  /** 提供商中文名（如 深度求索） */
  name: string
  /** 提供商英文名（如 DeepSeek；无则不显示） */
  nameEn?: string
  /** LOGO 标识（渲染层 ProviderLogo 组件按此渲染；如 deepseek=鲸鱼） */
  logo: string
  /** 提供商默认端点（Token Plan / Coding Plan 共用；用户可在 json 中修改） */
  defaultUrl: string
  /** 该提供商支持的提供方式；「自定义 API」与「其它」需用户填写端点 */
  plans: { type: ProviderPlanType }[]
  /** 该提供商可提供的模型列表（模型名称下拉数据源；可手改 json） */
  models: string[]
}

/** 需要用户填写端点的提供方式（弹窗展开 API 地址输入框） */
export const CUSTOM_URL_PLANS: readonly ProviderPlanType[] = ['自定义 API', '其它']

/** models.json 文件版本 */
export const MODELS_FILE_VERSION = 1

/** 合并文件的磁盘结构（version + providers + models） */
export interface ModelFileData {
  version: number
  providers: ProviderRecord[]
  models: ModelRecord[]
}

/**
 * 内置提供商种子数据（首启写入 ~/.ke-work/models.json，用户可手改）
 * - 端点均为 OpenAI 兼容 chat/completions 地址
 * - models 为各家 OpenAI 兼容 API 的主流模型标识（模型名称下拉数据源）；以官方文档为准可手改
 * 如有变更集中改这里
 */
export const SEED_PROVIDERS: ProviderRecord[] = [
  {
    id: 'deepseek',
    name: '深度求索',
    nameEn: 'DeepSeek',
    logo: 'deepseek',
    defaultUrl: 'https://api.deepseek.com/chat/completions',
    plans: [{ type: 'Token Plan' }, { type: 'Coding Plan' }, { type: '自定义 API' }],
    models: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash', 'deepseek-v4-pro']
  },
  {
    id: 'zhipu',
    name: '智谱',
    nameEn: 'Zhipu AI',
    logo: 'zhipu',
    defaultUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    plans: [{ type: 'Token Plan' }, { type: 'Coding Plan' }, { type: '自定义 API' }],
    models: [
      'glm-4-plus',
      'glm-4-air',
      'glm-4-airx',
      'glm-4-flash',
      'glm-4-long',
      'glm-4.5',
      'glm-4.5-air',
      'glm-5',
      'glm-5.1',
      'glm-z1-flash',
      'glm-z1-airx',
      'glm-4v-plus',
      'glm-4v-flash'
    ]
  },
  {
    id: 'moonshot',
    name: '月之暗面',
    nameEn: 'Moonshot AI',
    logo: 'moonshot',
    defaultUrl: 'https://api.moonshot.cn/v1/chat/completions',
    plans: [{ type: 'Token Plan' }, { type: 'Coding Plan' }, { type: '自定义 API' }],
    models: [
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
      'moonshot-v1-auto',
      'kimi-k2',
      'kimi-k2-0711-preview',
      'kimi-k2-thinking',
      'kimi-k2.5'
    ]
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    nameEn: 'MiniMax',
    logo: 'minimax',
    defaultUrl: 'https://api.minimax.chat/v1/chat/completions',
    plans: [{ type: 'Token Plan' }, { type: 'Coding Plan' }, { type: '自定义 API' }],
    models: [
      'abab6.5s-chat',
      'abab6.5-chat',
      'minimax-text-01',
      'MiniMax-M1',
      'MiniMax-M2',
      'MiniMax-M2.5',
      'MiniMax-M2.7'
    ]
  },
  {
    id: 'xiaomi',
    name: '小米',
    nameEn: 'Xiaomi',
    logo: 'xiaomi',
    defaultUrl: 'https://api.mimodel.com/v1/chat/completions',
    plans: [{ type: 'Token Plan' }, { type: 'Coding Plan' }, { type: '自定义 API' }],
    models: ['mimo-1.5b', 'mimo-7b', 'mimo-32k', 'mimo-vl-7b']
  },
  {
    id: 'aliyun',
    name: '阿里',
    nameEn: 'Alibaba Cloud',
    logo: 'aliyun',
    defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    plans: [{ type: 'Token Plan' }, { type: 'Coding Plan' }, { type: '自定义 API' }],
    models: [
      'qwen-turbo',
      'qwen-plus',
      'qwen-max',
      'qwen-long',
      'qwen-flash',
      'qwen3-turbo',
      'qwen3-plus',
      'qwen3-max',
      'qwen-coder-turbo',
      'qwen-coder-plus',
      'qwen-coder-max',
      'qwen3-coder-turbo',
      'qwen3-coder-plus',
      'qwen-math-plus',
      'qwen-math-turbo',
      'qwen-vl-plus',
      'qwen-vl-max',
      'qwen2.5-72b-instruct',
      'qwen2.5-coder-32b-instruct'
    ]
  },
  {
    id: 'tencent',
    name: '腾讯',
    nameEn: 'Tencent Cloud',
    logo: 'tencent',
    defaultUrl: 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions',
    plans: [{ type: 'Token Plan' }, { type: 'Coding Plan' }, { type: '自定义 API' }],
    models: [
      'hunyuan-lite',
      'hunyuan-standard',
      'hunyuan-pro',
      'hunyuan-turbo',
      'hunyuan-turbo-latest',
      'hunyuan-code',
      'hunyuan-t1',
      'hunyuan-t1-latest',
      'hunyuan-vision'
    ]
  },
  {
    id: 'bytedance',
    name: '字节',
    nameEn: 'ByteDance',
    logo: 'bytedance',
    defaultUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    plans: [{ type: 'Token Plan' }, { type: 'Coding Plan' }, { type: '自定义 API' }],
    models: [
      'doubao-lite-32k',
      'doubao-lite-128k',
      'doubao-pro-32k',
      'doubao-pro-128k',
      'doubao-1-5-pro-32k',
      'doubao-1-5-pro-256k',
      'doubao-1-5-lite-32k',
      'doubao-1-5-vision-pro-32k',
      'doubao-1-5-vision-lite-32k',
      'doubao-seed-1-6',
      'doubao-seed-1-6-vision'
    ]
  },
  {
    id: 'custom',
    name: '其它',
    nameEn: 'Custom',
    logo: 'custom',
    defaultUrl: '',
    plans: [{ type: '其它' }],
    models: []
  }
]
