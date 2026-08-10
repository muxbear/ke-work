import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'
import type { WorkspaceRow, WorkspaceSource } from './types'

interface WorkspaceRowDb {
  id: string
  name: string
  path: string
  source: WorkspaceSource
  user_id: string | null
  created_at: number
}

function toWorkspaceRow(row: WorkspaceRowDb): WorkspaceRow {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    source: row.source,
    userId: row.user_id,
    createdAt: row.created_at
  }
}

const SELECT_WS = 'SELECT id, name, path, source, user_id, created_at FROM workspaces'

/**
 * 用户可见范围谓词：本人的记录 + 机器级共享的默认空间记录
 * （默认空间目录全局唯一，记录 user_id 恒为 NULL 由所有用户共享）
 */
const WS_SCOPE = "(user_id = ? OR (user_id IS NULL AND source = 'default'))"

/** 工作空间仓储：workspaces 表 CRUD（better-sqlite3 prepared statement） */
export class WorkspaceRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * 用户的工作空间（按创建时间降序）
   * 先接管无主旧数据：user_id 为 NULL 且非默认空间的存量记录归属当前用户（幂等）
   */
  listForUser(userId: string): WorkspaceRow[] {
    this.db
      .prepare(`UPDATE workspaces SET user_id = ? WHERE user_id IS NULL AND source != 'default'`)
      .run(userId)
    // rowid DESC 作为同毫秒时间戳的 tiebreaker（后插入的在前）
    const rows = this.db
      .prepare(`${SELECT_WS} WHERE ${WS_SCOPE} ORDER BY created_at DESC, rowid DESC`)
      .all(userId) as WorkspaceRowDb[]
    return rows.map(toWorkspaceRow)
  }

  getById(id: string, userId: string): WorkspaceRow | undefined {
    const row = this.db.prepare(`${SELECT_WS} WHERE id = ? AND ${WS_SCOPE}`).get(id, userId) as
      | WorkspaceRowDb
      | undefined
    return row ? toWorkspaceRow(row) : undefined
  }

  /** 按路径查重（默认空间幂等、外部目录重复选择复用）；全局无用户过滤 */
  findByPath(path: string): WorkspaceRow | undefined {
    const row = this.db.prepare(`${SELECT_WS} WHERE path = ?`).get(path) as
      | WorkspaceRowDb
      | undefined
    return row ? toWorkspaceRow(row) : undefined
  }

  /** 任意默认空间记录（机器级唯一语义下取最早创建的一条作迁移目标） */
  findDefaultSource(): WorkspaceRow | undefined {
    const row = this.db
      .prepare(`${SELECT_WS} WHERE source = 'default' ORDER BY created_at ASC, rowid ASC LIMIT 1`)
      .get() as WorkspaceRowDb | undefined
    return row ? toWorkspaceRow(row) : undefined
  }

  /** 迁移默认空间路径（改基址后跟随新位置；id 不变，会话绑定不失效） */
  updatePath(id: string, path: string): void {
    this.db.prepare('UPDATE workspaces SET path = ? WHERE id = ?').run(path, id)
  }

  /** 收敛多余默认记录（仅删记录，磁盘目录保留；保留 keepId 那条） */
  removeOtherDefaults(keepId: string): void {
    this.db.prepare("DELETE FROM workspaces WHERE source = 'default' AND id != ?").run(keepId)
  }

  /** 无主记录定向接管（外部目录重复选择时把 NULL 记录归属当前用户；幂等） */
  adoptByPath(path: string, userId: string): void {
    this.db
      .prepare('UPDATE workspaces SET user_id = ? WHERE path = ? AND user_id IS NULL')
      .run(userId, path)
  }

  create(input: {
    name: string
    path: string
    source: WorkspaceSource
    userId: string | null
  }): WorkspaceRow {
    const id = randomUUID()
    const now = Date.now()
    this.db
      .prepare(
        'INSERT INTO workspaces (id, name, path, source, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, input.name, input.path, input.source, input.userId, now)
    return {
      id,
      name: input.name,
      path: input.path,
      source: input.source,
      userId: input.userId,
      createdAt: now
    }
  }

  /** 删除本人记录；返回删除行数（0 = 不存在或非本人） */
  delete(id: string, userId: string): number {
    return this.db
      .prepare('DELETE FROM workspaces WHERE id = ? AND user_id = ?')
      .run(id, userId).changes
  }
}
