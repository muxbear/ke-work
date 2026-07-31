import { EventEmitter } from 'events'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type WorkMode = 'local' | 'cloud'

const MODE_FILE = 'work-mode.json'
const VALID_MODES: WorkMode[] = ['local', 'cloud']

/**
 * 工作模式管理（单例由调用方持有）
 * 持久化到 <configDir>/work-mode.json，独立于数据库，保证模式读取的健壮性
 */
export class WorkModeStore {
  private mode: WorkMode = 'local'
  private readonly filePath: string
  private readonly emitter = new EventEmitter()

  constructor(configDir: string) {
    this.filePath = join(configDir, MODE_FILE)
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    this.load()
  }

  private load(): void {
    try {
      if (!existsSync(this.filePath)) return
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8')) as { mode?: unknown }
      if (typeof raw.mode === 'string' && (VALID_MODES as string[]).includes(raw.mode)) {
        this.mode = raw.mode as WorkMode
      } else {
        console.warn(`[work-mode] invalid mode "${String(raw.mode)}", fallback to local`)
        this.mode = 'local'
        this.persist()
      }
    } catch (err) {
      console.warn('[work-mode] failed to load mode, fallback to local:', err)
      this.mode = 'local'
    }
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify({ mode: this.mode }, null, 2), 'utf-8')
  }

  getMode(): WorkMode {
    return this.mode
  }

  setMode(mode: WorkMode): void {
    if (!(VALID_MODES as string[]).includes(mode)) {
      throw new Error(`[work-mode] invalid mode: ${String(mode)}`)
    }
    if (this.mode === mode) return
    this.mode = mode
    this.persist()
    this.emitter.emit('mode:changed', mode)
  }

  onModeChanged(listener: (mode: WorkMode) => void): () => void {
    this.emitter.on('mode:changed', listener)
    return () => this.emitter.off('mode:changed', listener)
  }
}
