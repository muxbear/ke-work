import { readdir, stat, statfs } from 'fs/promises'
import type { Dirent } from 'fs'
import { join } from 'path'

/** 存储统计结果（config:storage-stats 返回） */
export interface StorageStats {
  baseDir: string
  /** ~/.ke-work 目录实际占用字节数 */
  usedBytes: number
  /** 磁盘总容量（statfs bsize*blocks；异常时为 0，UI 兜底显示 '--'） */
  diskTotal: number
  /** 磁盘可用容量（statfs bsize*bavail） */
  diskFree: number
  /** 统计超时降级（目录过大时仅统计了部分） */
  partial?: boolean
}

export interface DirSizeOptions {
  /** 目录读取并发上限（默认 16） */
  concurrency?: number
  /** 统计超时（默认 30s；超时返回已统计部分并标记 partial） */
  timeoutMs?: number
}

/**
 * 递归统计目录占用字节数：
 * - 跳过符号链接（防循环）
 * - 吞掉 EACCES/EPERM/ENOENT（权限目录跳过，不中断）
 * - 并发上限 + 超时降级（防 ~/.ke-work 超大缓存/大库时挂起）
 */
export async function computeDirSize(
  dir: string,
  opts: DirSizeOptions = {}
): Promise<{ bytes: number; partial: boolean }> {
  const concurrency = opts.concurrency ?? 16
  const timeoutMs = opts.timeoutMs ?? 30_000

  let bytes = 0
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | null = null
  if (timeoutMs <= 0) {
    timedOut = true // 超时阈值 0：同步降级（确定性）
  } else {
    timer = setTimeout(() => {
      timedOut = true
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
  }

  async function walk(dirPath: string): Promise<void> {
    if (timedOut) return
    let entries: Dirent[]
    try {
      entries = await readdir(dirPath, { withFileTypes: true })
    } catch {
      return // 目录不存在/无权限 → 跳过
    }
    for (let i = 0; i < entries.length; i += concurrency) {
      if (timedOut) return
      const chunk = entries.slice(i, i + concurrency)
      await Promise.all(
        chunk.map(async (entry) => {
          if (timedOut) return
          try {
            if (entry.isSymbolicLink()) return
            if (entry.isDirectory()) {
              await walk(join(dirPath, entry.name))
            } else if (entry.isFile()) {
              bytes += (await stat(join(dirPath, entry.name))).size
            }
          } catch {
            // EACCES/EPERM/ENOENT 等 → 跳过单个条目
          }
        })
      )
    }
  }

  await walk(dir)
  if (timer) clearTimeout(timer)
  return { bytes, partial: timedOut }
}

/** 目录占用 + 磁盘容量（statfs 异常时容量为 0，由 UI 兜底） */
export async function getDiskUsage(baseDir: string): Promise<StorageStats> {
  const [dirSize, fs] = await Promise.all([
    computeDirSize(baseDir),
    statfs(baseDir).catch(() => null)
  ])
  return {
    baseDir,
    usedBytes: dirSize.bytes,
    diskTotal: fs ? fs.bsize * fs.blocks : 0,
    diskFree: fs ? fs.bsize * fs.bavail : 0,
    partial: dirSize.partial
  }
}
