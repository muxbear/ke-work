import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const WORKSPACE_STATE_FILE = 'workspace-state.json'

/** 工作区状态（对齐 WorkBuddy workspace-state.json 实测：version 化状态） */
export interface WorkspaceState {
  version: 1
  /** 引导初始化时间（预留字段，后续扩展） */
  bootstrapSeededAt?: string
}

/**
 * 工作区状态存储：~/.ke-work/workspace-state.json（顶层，对齐 WorkBuddy 实测）。
 * version 化结构：未来字段扩展/结构迁移按 version 演进。
 */
export class WorkspaceStateStore {
  private state: WorkspaceState
  private readonly filePath: string

  constructor(baseDir: string) {
    this.filePath = join(baseDir, WORKSPACE_STATE_FILE)
    mkdirSync(baseDir, { recursive: true })
    this.state = { version: 1 }
    this.load()
  }

  private load(): void {
    try {
      if (!existsSync(this.filePath)) return
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8')) as WorkspaceState
      if (raw && typeof raw.version === 'number' && raw.version === 1) {
        this.state = raw
      }
      // 未来版本：version > 1 时按版本迁移（机制预留）
    } catch (err) {
      console.warn('[workspace-state] failed to load, using defaults:', err)
    }
  }

  getState(): WorkspaceState {
    return { ...this.state }
  }

  setState(patch: Partial<Omit<WorkspaceState, 'version'>>): void {
    this.state = { ...this.state, ...patch }
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8')
  }
}
