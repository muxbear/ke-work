import Database from 'better-sqlite3'
import { BaseStore } from '@langchain/langgraph-checkpoint'
import type {
  Item,
  Operation,
  OperationResults,
  SearchItem
} from '@langchain/langgraph-checkpoint'

/**
 * SQLite 长期记忆 Store（参考 PostgresStore 移植的 SQLite 版）
 *
 * API 面与存储协议对齐 @langchain/langgraph-checkpoint-postgres 的 PostgresStore：
 * - namespace 编码 namespace.join(':')（同 executePut）
 * - value 存 JSON.stringify、读回 JSON.parse
 * - delete 复用 put 语义（value=null 时 DELETE）
 * - put 为 UPSERT（ON CONFLICT 更新 value/expires_at/updated_at）
 * - search 无向量索引，走文本降级（namespace_path LIKE 前缀 + value 内容匹配），对应 textSearch
 * - filter 在 JS 侧应用（对齐 Postgres filter 的顶层字段语义）
 */

interface SqliteStoreTtlConfig {
  /** 默认 TTL（分钟），put 未显式指定时使用 */
  defaultTtl?: number
  /** 读取时是否刷新 TTL（默认 false，简化） */
  refreshOnRead?: boolean
}

interface SqliteStoreOptions {
  /** 是否自动建表（默认 true） */
  ensureTables?: boolean
  /** TTL 配置 */
  ttl?: SqliteStoreTtlConfig
}

/** namespace 校验：非空数组、元素非空且不含 ':'（对齐 PostgresStore validateNamespace） */
function validateNamespace(namespace: string[]): void {
  if (!Array.isArray(namespace) || namespace.length === 0) {
    throw new Error(`Namespace must be a non-empty array: ${JSON.stringify(namespace)}`)
  }
  for (const ns of namespace) {
    if (typeof ns !== 'string' || ns.length === 0) {
      throw new Error(`Namespace elements must be non-empty strings: ${JSON.stringify(namespace)}`)
    }
  }
}

/** filter 条件：顶层字段等值/范围/存在性匹配（简化版，对齐 SearchOptions.filter 语义） */
function matchesFilter(value: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [field, cond] of Object.entries(filter)) {
    const fieldValue = field === '$' ? value : value[field]
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
      // 操作符形式 { $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $exists }
      const op = cond as Record<string, unknown>
      if ('$eq' in op && fieldValue !== op['$eq']) return false
      if ('$ne' in op && fieldValue === op['$ne']) return false
      if ('$gt' in op && !(typeof fieldValue === 'number' && fieldValue > (op['$gt'] as number))) return false
      if ('$gte' in op && !(typeof fieldValue === 'number' && fieldValue >= (op['$gte'] as number))) return false
      if ('$lt' in op && !(typeof fieldValue === 'number' && fieldValue < (op['$lt'] as number))) return false
      if ('$lte' in op && !(typeof fieldValue === 'number' && fieldValue <= (op['$lte'] as number))) return false
      if ('$in' in op && !(Array.isArray(op['$in']) && (op['$in'] as unknown[]).includes(fieldValue))) return false
      if ('$nin' in op && (Array.isArray(op['$nin']) && (op['$nin'] as unknown[]).includes(fieldValue))) return false
      if ('$exists' in op) {
        const exists = fieldValue !== undefined
        if ((op['$exists'] as boolean) !== exists) return false
      }
    } else if (fieldValue !== cond) {
      return false
    }
  }
  return true
}

export class SqliteStore extends BaseStore {
  private db: Database.Database
  private readonly ensureTables: boolean
  private readonly ttlConfig?: SqliteStoreTtlConfig
  private isSetup = false
  private isClosed = false

  constructor(dbPath: string, options: SqliteStoreOptions = {}) {
    super()
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.ensureTables = options.ensureTables ?? true
    this.ttlConfig = options.ttl
  }

  /** 从连接串/文件路径创建（对齐 PostgresStore.fromConnString 工厂方式） */
  static fromConnString(dbPath: string, options?: SqliteStoreOptions): SqliteStore {
    return new SqliteStore(dbPath, options)
  }

  /** 建表（幂等） */
  async setup(): Promise<void> {
    if (this.isSetup) return
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS store (
        namespace_path TEXT NOT NULL,
        key           TEXT NOT NULL,
        value         TEXT NOT NULL,
        expires_at    INTEGER,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        PRIMARY KEY (namespace_path, key)
      );
      CREATE INDEX IF NOT EXISTS idx_store_namespace ON store(namespace_path);
    `)
    this.isSetup = true
  }

  private async ensureSetup(): Promise<void> {
    if (!this.isSetup && this.ensureTables) await this.setup()
  }

  /** 计算过期时间（ms）；put 显式 ttl > 默认 ttl > 无 */
  private calculateExpiresAt(ttl?: number): number | null {
    const ttlMinutes = ttl ?? this.ttlConfig?.defaultTtl
    return ttlMinutes !== undefined ? Date.now() + ttlMinutes * 60_000 : null
  }

  private rowToItem(row: { namespace_path: string; key: string; value: string; created_at: number; updated_at: number }): Item {
    return {
      namespace: row.namespace_path.split(':'),
      key: row.key,
      value: JSON.parse(row.value),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  async start(): Promise<void> {
    if (this.ensureTables && !this.isSetup) await this.setup()
  }

  async stop(): Promise<void> {
    if (this.isClosed) return
    this.db.close()
    this.isClosed = true
  }

  async get(namespace: string[], key: string): Promise<Item | null> {
    await this.ensureSetup()
    validateNamespace(namespace)
    const namespacePath = namespace.join(':')
    const row = this.db
      .prepare(
        `SELECT namespace_path, key, value, created_at, updated_at
         FROM store
         WHERE namespace_path = ? AND key = ?
           AND (expires_at IS NULL OR expires_at > ?)`
      )
      .get(namespacePath, key, Date.now()) as
      | { namespace_path: string; key: string; value: string; created_at: number; updated_at: number }
      | undefined
    if (!row) return null
    return this.rowToItem(row)
  }

  async put(
    namespace: string[],
    key: string,
    value: Record<string, unknown> | null,
    _index?: false | string[],
    options?: { ttl?: number }
  ): Promise<void> {
    await this.ensureSetup()
    validateNamespace(namespace)
    const namespacePath = namespace.join(':')
    if (value === null) {
      this.db.prepare('DELETE FROM store WHERE namespace_path = ? AND key = ?').run(namespacePath, key)
      return
    }
    const now = Date.now()
    const expiresAt = this.calculateExpiresAt(options?.ttl)
    this.db
      .prepare(
        `INSERT INTO store (namespace_path, key, value, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (namespace_path, key)
         DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, updated_at = excluded.updated_at`
      )
      .run(namespacePath, key, JSON.stringify(value), expiresAt, now, now)
  }

  async delete(namespace: string[], key: string): Promise<void> {
    await this.ensureSetup()
    validateNamespace(namespace)
    const namespacePath = namespace.join(':')
    this.db.prepare('DELETE FROM store WHERE namespace_path = ? AND key = ?').run(namespacePath, key)
  }

  async listNamespaces(options: {
    prefix?: string[]
    suffix?: string[]
    maxDepth?: number
    limit?: number
    offset?: number
  } = {}): Promise<string[][]> {
    await this.ensureSetup()
    const { prefix, suffix, maxDepth, limit = 100, offset = 0 } = options
    const conditions: string[] = []
    const params: unknown[] = []
    if (prefix) {
      conditions.push('namespace_path LIKE ?')
      params.push(`${prefix.join(':')}%`)
    }
    if (suffix) {
      conditions.push('namespace_path LIKE ?')
      params.push(`%${suffix.join(':')}`)
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const rows = this.db
      .prepare(`SELECT DISTINCT namespace_path FROM store${where} ORDER BY namespace_path LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as { namespace_path: string }[]
    let namespaces = rows.map((r) => r.namespace_path.split(':'))
    if (maxDepth !== undefined) namespaces = namespaces.filter((ns) => ns.length <= maxDepth)
    return namespaces
  }

  async search(
    namespacePrefix: string[],
    options: {
      filter?: Record<string, unknown>
      limit?: number
      offset?: number
      query?: string
    } = {}
  ): Promise<SearchItem[]> {
    await this.ensureSetup()
    validateNamespace(namespacePrefix)
    const namespacePath = namespacePrefix.join(':')
    const { filter, limit = 10, offset = 0, query } = options

    let sql = `SELECT namespace_path, key, value, created_at, updated_at
               FROM store
               WHERE namespace_path LIKE ? AND (expires_at IS NULL OR expires_at > ?)`
    const params: unknown[] = [`${namespacePath}%`, Date.now()]
    if (query) {
      sql += ' AND value LIKE ?'
      params.push(`%${query}%`)
    }
    const rows = this.db.prepare(`${sql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(
      ...params,
      limit,
      offset
    ) as {
      namespace_path: string
      key: string
      value: string
      created_at: number
      updated_at: number
    }[]

    const items: SearchItem[] = []
    for (const row of rows) {
      const parsed = JSON.parse(row.value) as Record<string, unknown>
      if (filter && Object.keys(filter).length > 0 && !matchesFilter(parsed, filter)) continue
      items.push({
        namespace: row.namespace_path.split(':'),
        key: row.key,
        value: parsed,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      })
    }
    return items
  }

  /** 批量操作（对齐 PostgresStore.batch 的操作类型分发） */
  async batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    await this.ensureSetup()
    const results: unknown[] = []
    for (const operation of operations) {
      if ('namespacePrefix' in operation) {
        const op = operation as { namespacePrefix: string[]; filter?: Record<string, unknown>; limit?: number; offset?: number; query?: string }
        results.push(
          await this.search(op.namespacePrefix, {
            filter: op.filter,
            limit: op.limit,
            offset: op.offset,
            query: op.query
          })
        )
      } else if ('key' in operation && !('value' in operation)) {
        results.push(await this.get(operation.namespace as string[], operation.key as string))
      } else if ('value' in operation) {
        const op = operation as { namespace: string[]; key: string; value: Record<string, unknown> | null }
        await this.put(op.namespace, op.key, op.value)
        results.push(null)
      } else if ('matchConditions' in operation) {
        const op = operation as {
          matchConditions?: { matchType: 'prefix' | 'suffix'; path: string[] }[]
          maxDepth?: number
          limit?: number
          offset?: number
        }
        const prefix = op.matchConditions?.find((m) => m.matchType === 'prefix')?.path
        const suffix = op.matchConditions?.find((m) => m.matchType === 'suffix')?.path
        results.push(await this.listNamespaces({ prefix, suffix, maxDepth: op.maxDepth, limit: op.limit, offset: op.offset }))
      } else {
        throw new Error(`Unsupported operation type: ${JSON.stringify(operation)}`)
      }
    }
    return results as OperationResults<Op>
  }
}
