import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const LAST_LAUNCH_FILE = 'last-launch.json'

/** 启动快照（对齐 WorkBuddy last-launch.json 实测格式：version/build/timestamp） */
export interface LastLaunch {
  version: string
  build: string
  timestamp: string
}

/**
 * 启动快照存储：每次启动 setLaunch() 覆盖写 last-launch.json（快照语义，对齐 WorkBuddy
 * last-launch.json/argv.json——每次重启被覆盖，不承载自定义配置）。
 * getLastLaunch() 供版本升级检测（新功能引导/迁移触发）。
 */
export class LastLaunchStore {
  private lastLaunch: LastLaunch | null = null
  private readonly filePath: string

  constructor(baseDir: string) {
    this.filePath = join(baseDir, LAST_LAUNCH_FILE)
    mkdirSync(baseDir, { recursive: true })
    this.load()
  }

  private load(): void {
    try {
      if (!existsSync(this.filePath)) return
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8')) as LastLaunch
      if (raw && typeof raw.version === 'string' && typeof raw.timestamp === 'string') {
        this.lastLaunch = raw
      }
    } catch (err) {
      console.warn('[last-launch] failed to load, ignoring:', err)
    }
  }

  getLastLaunch(): LastLaunch | null {
    return this.lastLaunch
  }

  /** 每次启动覆盖写（快照语义；非关键数据，直接写） */
  setLaunch(info: LastLaunch): void {
    this.lastLaunch = info
    writeFileSync(this.filePath, JSON.stringify(info, null, 2), 'utf-8')
  }
}
