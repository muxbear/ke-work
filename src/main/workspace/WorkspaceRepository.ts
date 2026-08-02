import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'
import type { WorkspaceRow, WorkspaceSource } from './types'

interface WorkspaceRowDb {
  id: string
  name: string
  path: string
  source: WorkspaceSource
  created_at: number
}

function toWorkspaceRow(row: WorkspaceRowDb): WorkspaceRow {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    source: row.source,
    createdAt: row.created_at
  }
}

const SELECT_WS = 'SELECT id, name, path, source, created_at FROM workspaces'

/** 工作空间仓储：workspaces 表 CRUD（better-sqlite3 prepared statement） */
export class WorkspaceRepository {
  constructor(private readonly db: Database.Database) {}

  /** 全部工作空间（按创建时间降序） */
  list(): WorkspaceRow[] {
    // rowid DESC 作为同毫秒时间戳的 tiebreaker（后插入的在前）
    const rows = this.db
      .prepare(`${SELECT_WS} ORDER BY created_at DESC, rowid DESC`)
      .all() as WorkspaceRowDb[]
    return rows.map(toWorkspaceRow)
  }

  getById(id: string): WorkspaceRow | undefined {
    const row = this.db.prepare(`${SELECT_WS} WHERE id = ?`).get(id) as
      | WorkspaceRowDb
      | undefined
    return row ? toWorkspaceRow(row) : undefined
  }

  findByPath(path: string): WorkspaceRow | undefined {
    const row = this.db.prepare(`${SELECT_WS} WHERE path = ?`).get(path) as
      | WorkspaceRowDb
      | undefined
    return row ? toWorkspaceRow(row) : undefined
  }

  create(input: {
    name: string
    path: string
    source: WorkspaceSource
  }): WorkspaceRow {
    const id = randomUUID()
    const now = Date.now()
    this.db
      .prepare(
        'INSERT INTO workspaces (id, name, path, source, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, input.name, input.path, input.source, now)
    return { id, name: input.name, path: input.path, source: input.source, createdAt: now }
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
  }
}
