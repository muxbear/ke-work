import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

/** 预定义的子目录列表（会话数据已迁移至 LangGraph checkpointer，无 conversations 目录） */
export const SUB_DIRS = ['logs', 'config', 'cache', 'workspace'] as const
export type SubDir = (typeof SUB_DIRS)[number]

/**
 * 数据目录管理器（单例）
 * 以 ~/.ke-work 为基础目录，管理应用数据的子目录
 */
export class DataDirectory {
  private baseDir: string

  constructor(baseDir: string) {
    this.baseDir = baseDir
  }

  /** 获取基础目录路径 ~/.ke-work */
  getBaseDir(): string {
    return this.baseDir
  }

  /** 获取指定子目录的路径 ~/.ke-work/<sub> */
  getDir(sub: SubDir): string {
    return join(this.baseDir, sub)
  }

  /**
   * 确保指定子目录存在（懒初始化）
   * @param sub 子目录名称
   * @returns 子目录的完整路径
   */
  ensureDir(sub: SubDir): string {
    const dirPath = this.getDir(sub)
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
      console.log(`[data-dir] created directory: ${dirPath}`)
    }
    return dirPath
  }

  /** 一次性创建所有预定义子目录 */
  ensureAll(): void {
    SUB_DIRS.forEach((sub) => this.ensureDir(sub))
  }
}

let instance: DataDirectory | null = null

/**
 * 初始化数据目录（应用启动时调用）
 * 创建基础目录及所有子目录；基础目录默认为 ~/.ke-work，
 * 可通过环境变量 KE_WORK_HOME 覆盖（测试隔离/多实例部署）
 * @returns DataDirectory 单例实例
 */
export function initDataDirectory(): DataDirectory {
  if (instance) return instance

  const baseDir = process.env.KE_WORK_HOME ?? join(homedir(), '.ke-work')

  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true })
    console.log(`[data-dir] created base directory: ${baseDir}`)
  }

  instance = new DataDirectory(baseDir)
  instance.ensureAll()

  console.log(`[data-dir] initialized, base: ${baseDir}`)
  return instance
}

/**
 * 获取已初始化的 DataDirectory 单例
 * @returns DataDirectory 实例
 * @throws 如果尚未调用 initDataDirectory
 */
export function getDataDirectory(): DataDirectory {
  if (!instance) {
    throw new Error('DataDirectory not initialized. Call initDataDirectory() first.')
  }
  return instance
}
