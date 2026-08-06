import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { computeDirSize, getDiskUsage } from '../../../src/main/settings/DiskUsageService'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ke-disk-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('computeDirSize', () => {
  it('统计文件/嵌套目录字节数', async () => {
    writeFileSync(join(dir, 'a.txt'), 'x'.repeat(100))
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'sub', 'b.txt'), 'y'.repeat(50))
    const { bytes } = await computeDirSize(dir)
    expect(bytes).toBe(150)
  })

  it('空目录返回 0', async () => {
    const { bytes, partial } = await computeDirSize(dir)
    expect(bytes).toBe(0)
    expect(partial).toBe(false)
  })

  it('不存在的目录不抛错', async () => {
    const { bytes } = await computeDirSize(join(dir, 'missing'))
    expect(bytes).toBe(0)
  })

  it('符号链接跳过（不跟随；Windows 无权限创建时跳过该断言）', async () => {
    writeFileSync(join(dir, 'target.txt'), 'x'.repeat(500))
    let linkCreated = false
    try {
      symlinkSync(join(dir, 'target.txt'), join(dir, 'link.txt'))
      linkCreated = true
    } catch {
      // Windows 非管理员可能无法创建符号链接 → 跳过
    }
    const { bytes } = await computeDirSize(dir)
    if (linkCreated) {
      expect(bytes).toBe(500) // 链接本身不计大小
    } else {
      expect(bytes).toBe(500)
    }
  })

  it('超时降级：timeoutMs 极小 → partial=true 且不挂起', async () => {
    writeFileSync(join(dir, 'a.txt'), 'x'.repeat(10))
    const { partial } = await computeDirSize(dir, { timeoutMs: 0 })
    expect(partial).toBe(true)
  })
})

describe('getDiskUsage', () => {
  it('返回目录占用 + 磁盘容量', async () => {
    writeFileSync(join(dir, 'a.txt'), 'x'.repeat(64))
    const stats = await getDiskUsage(dir)
    expect(stats.baseDir).toBe(dir)
    expect(stats.usedBytes).toBeGreaterThanOrEqual(64)
    expect(stats.diskTotal).toBeGreaterThan(0)
    expect(stats.diskFree).toBeGreaterThan(0)
    expect(stats.diskTotal).toBeGreaterThan(stats.diskFree)
  })
})
