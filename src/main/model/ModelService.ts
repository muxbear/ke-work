import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import {
  MODELS_FILE_VERSION,
  SEED_PROVIDERS,
  type AddModelInput,
  type ModelFileData,
  type ModelRecord,
  type ProviderRecord
} from './types'

const MODELS_FILE = 'models.json'

/**
 * 自定义模型与提供商存储（机器级，与登录态无关，同 config:* 先例）
 *
 * - 单一文件 ~/.ke-work/models.json：{ version, providers, models }
 *   - providers：提供商下拉数据源，缺失/为空时用内置种子（用户可手改）
 *   - models：用户自定义模型数组（apiKey 明文，本地文件可手改）
 * - 兼容：早期版本 models.json 为顶层数组（仅模型），加载时自动识别迁移
 * - 写入：.bak 备份 → 临时文件原子写 → rename 替换（对齐 SettingsStore）
 * - 损坏恢复：JSON 解析失败优先 .bak，均失败保留为 .corrupt 并回退默认
 * - 运行期内存快照为权威；外部编辑需重启生效
 */
export class ModelService {
  private models: ModelRecord[] = []
  private providers: ProviderRecord[] = []
  private readonly filePath: string

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true })
    this.filePath = join(baseDir, MODELS_FILE)
    this.load()
  }

  /** 全部自定义模型（深拷贝，调用方可安全修改） */
  list(): ModelRecord[] {
    return this.models.map((m) => ({ ...m }))
  }

  /** 全部提供商（深拷贝） */
  listProviders(): ProviderRecord[] {
    return this.providers.map((p) => ({ ...p, plans: [...p.plans] }))
  }

  /**
   * 主进程内部用：按 id 取模型调用凭据（agent 模型覆盖中间件）；不存在返回 null
   * id 即 API 模型标识（如 deepseek-chat / gpt-4o），name 为显示名
   */
  getCredential(id: string): Pick<ModelRecord, 'id' | 'name' | 'apiKey' | 'url'> | null {
    const model = this.models.find((m) => m.id === id)
    if (!model) return null
    return { id: model.id, name: model.name, apiKey: model.apiKey, url: model.url }
  }

  /** 校验并添加模型；非法入参抛错（IPC handler 转 { success: false }） */
  add(input: AddModelInput): ModelRecord {
    const id = input.id.trim()
    const name = input.name.trim()
    const vendor = input.vendor.trim()
    const url = input.url.trim()
    const apiKey = input.apiKey.trim()
    this.assertValid({ id, name, vendor, url, apiKey })
    if (this.models.some((m) => m.id === id)) throw new Error('已存在同名模型')

    const record: ModelRecord = {
      id,
      name,
      vendor,
      url,
      apiKey,
      supportsToolCall: true,
      supportsImages: false,
      supportsReasoning: false
    }
    this.models.push(record)
    this.persist()
    return { ...record }
  }

  /**
   * 更新模型（按原 id 定位；模型名称即 id 可一并修改，改后全局唯一性校验）；
   * 不存在抛错
   */
  update(id: string, input: AddModelInput): ModelRecord {
    const index = this.models.findIndex((m) => m.id === id)
    if (index === -1) throw new Error('模型不存在')
    const newId = input.id.trim()
    const name = input.name.trim()
    const vendor = input.vendor.trim()
    const url = input.url.trim()
    const apiKey = input.apiKey.trim()
    this.assertValid({ id: newId, name, vendor, url, apiKey })
    // 改名即改 id：新 id 不得与其他模型冲突（排除自身）
    if (this.models.some((m) => m.id === newId && m.id !== id)) throw new Error('已存在同名模型')

    const record: ModelRecord = {
      ...this.models[index],
      id: newId,
      name,
      vendor,
      url,
      apiKey
    }
    this.models[index] = record
    this.persist()
    return { ...record }
  }

  /** 移除模型（幂等：不存在不报错） */
  remove(id: string): void {
    const before = this.models.length
    this.models = this.models.filter((m) => m.id !== id)
    if (this.models.length !== before) this.persist()
  }

  /** 入参校验（id/name/vendor/apiKey/url；id 仅新建时唯一校验） */
  private assertValid(input: {
    id: string
    name: string
    vendor: string
    url: string
    apiKey: string
  }): void {
    if (!input.id || input.id.length > 100) throw new Error('模型标识不能为空且不超过 100 字符')
    if (!input.name) throw new Error('模型名称不能为空')
    if (!input.vendor) throw new Error('提供商不能为空')
    if (!input.url || !/^https?:\/\//.test(input.url)) throw new Error('API 地址必须以 http(s):// 开头')
    if (!input.apiKey) throw new Error('API Key 不能为空')
  }

  private load(): void {
    try {
      if (!existsSync(this.filePath)) {
        // 缺失 → 空模型 + 种子提供商，立即落盘（磁盘文件即配置源，打开即可见/手改）
        this.providers = seedProviders()
        this.persist()
        return
      }
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8')) as unknown
      this.providers = seedProviders()
      if (Array.isArray(raw)) {
        // 兼容：早期版本为顶层数组（仅模型）→ 立即迁移落盘（含种子 providers）
        console.warn('[model] legacy models.json (top-level array) detected, migrating')
        this.models = raw.filter(isModelRecord)
        this.persist()
        return
      }
      if (typeof raw !== 'object' || raw === null) throw new Error('invalid format')
      const data = raw as Record<string, unknown>
      const rawVersion = typeof data['version'] === 'number' ? data['version'] : undefined
      if (typeof rawVersion === 'number' && rawVersion > MODELS_FILE_VERSION) {
        // 高版本文件结构未知 → 回退默认，不写盘避免破坏高版本数据
        console.warn(
          `[model] models file version ${rawVersion} > supported ${MODELS_FILE_VERSION}, fallback to defaults`
        )
        return
      }
      const models = data['models']
      if (!Array.isArray(models)) throw new Error('invalid format: expected models array')
      this.models = models.filter(isModelRecord)
      // 提供商：文件内已定义且合法则用文件值（用户手改优先），否则补种子并落盘
      const providers = data['providers']
      const filtered = Array.isArray(providers)
        ? providers.filter(isProviderRecord).map(normalizeProvider)
        : []
      if (filtered.length > 0) {
        this.applyFileProviders(filtered)
      } else {
        console.warn('[model] providers missing or invalid in models.json, seeding')
        this.persist()
      }
    } catch (err) {
      console.warn('[model] failed to load models.json, trying .bak:', err)
      if (this.tryRestoreFromBak()) return
      this.preserveCorrupt(this.filePath)
      this.models = []
      this.providers = seedProviders()
    }
  }

  /** 从 .bak 恢复（对齐 SettingsStore）；成功返回 true */
  private tryRestoreFromBak(): boolean {
    const bakPath = `${this.filePath}.bak`
    if (!existsSync(bakPath)) return false
    try {
      const raw = JSON.parse(readFileSync(bakPath, 'utf-8')) as unknown
      this.providers = seedProviders()
      if (Array.isArray(raw)) {
        this.models = raw.filter(isModelRecord)
      } else {
        const data = raw as Record<string, unknown>
        if (typeof data !== 'object' || data === null) throw new Error('invalid format')
        const models = data['models']
        if (!Array.isArray(models)) throw new Error('invalid format')
        this.models = models.filter(isModelRecord)
        const providers = data['providers']
        if (Array.isArray(providers) && providers.length > 0) {
          const filtered = providers.filter(isProviderRecord).map(normalizeProvider)
          if (filtered.length > 0) this.applyFileProviders(filtered)
        }
      }
      console.warn('[model] restored models from .bak')
      this.persist()
      return true
    } catch (bakErr) {
      console.warn('[model] .bak also corrupted:', bakErr)
      return false
    }
  }

  /** 损坏文件保留为 .corrupt（排查惯例），不静默删除 */
  private preserveCorrupt(filePath: string): void {
    try {
      renameSync(filePath, `${filePath}.corrupt`)
    } catch (renameErr) {
      console.warn('[model] failed to preserve corrupt file:', renameErr)
    }
  }

  /** 写入：.bak 备份 → 临时文件 → 原子替换（合并结构 version + providers + models） */
  private persist(): void {
    if (existsSync(this.filePath)) {
      copyFileSync(this.filePath, `${this.filePath}.bak`)
    }
    const tmp = `${this.filePath}.tmp`
    const data: ModelFileData = {
      version: MODELS_FILE_VERSION,
      providers: this.providers,
      models: this.models
    }
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    renameSync(tmp, this.filePath)
  }

  /** 测试用：当前文件路径 */
  getFilePath(): string {
    return this.filePath
  }

  /**
   * 应用文件中的提供商：旧种子文件（id 集合与种子一致）中 models 缺失/为空的提供商
   * 以新种子初始化并落盘（models.json 各提供商模型数据初始化）；手改文件完全以文件值为准
   */
  private applyFileProviders(filtered: ProviderRecord[]): void {
    const seedIds = new Set(SEED_PROVIDERS.map((p) => p.id))
    const isLegacySeed =
      filtered.length === seedIds.size && filtered.every((p) => seedIds.has(p.id))
    if (isLegacySeed) {
      let changed = false
      this.providers = filtered.map((p) => {
        const seed = SEED_PROVIDERS.find((s) => s.id === p.id)
        if (seed && p.models.length === 0) {
          changed = true
          return { ...p, models: [...seed.models] }
        }
        return p
      })
      if (changed) this.persist()
    } else {
      this.providers = filtered
    }
  }
}

/** 种子提供商深拷贝 */
function seedProviders(): ProviderRecord[] {
  return SEED_PROVIDERS.map((p) => ({ ...p, plans: [...p.plans], models: [...p.models] }))
}

/** 结构宽松校验（手改文件容错）：字段类型不对的记录跳过而非整文件失败 */
function isModelRecord(value: unknown): value is ModelRecord {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.vendor === 'string' &&
    typeof v.url === 'string' &&
    typeof v.apiKey === 'string' &&
    typeof v.supportsToolCall === 'boolean' &&
    typeof v.supportsImages === 'boolean' &&
    typeof v.supportsReasoning === 'boolean'
  )
}

/**
 * 结构宽松校验（用户手改文件容错）
 * logo/models 缺失时回填默认（旧文件兼容：logo 用 id，models 为空数组）
 */
function isProviderRecord(value: unknown): value is ProviderRecord {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.defaultUrl === 'string' &&
    Array.isArray(v.plans)
  )
}

/** 补全提供商可选字段（旧文件无 logo/models 时回填默认） */
function normalizeProvider(value: ProviderRecord): ProviderRecord {
  return {
    ...value,
    logo: typeof value.logo === 'string' && value.logo ? value.logo : value.id,
    models: Array.isArray(value.models) ? value.models : []
  }
}
