import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { LastLaunchStore } from '../../../src/main/state/LastLaunchStore'

let baseDir: string

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'ke-launch-'))
})

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true })
})

describe('LastLaunchStore', () => {
  it('首次启动：无快照，setLaunch 后文件存在且内容含 version/build/timestamp', () => {
    const store = new LastLaunchStore(baseDir)
    expect(store.getLastLaunch()).toBeNull()
    store.setLaunch({ version: '1.0.0', build: 'abc123', timestamp: '2026-08-06T00:00:00.000Z' })
    const raw = JSON.parse(readFileSync(join(baseDir, 'last-launch.json'), 'utf-8'))
    expect(raw).toEqual({
      version: '1.0.0',
      build: 'abc123',
      timestamp: '2026-08-06T00:00:00.000Z'
    })
  })

  it('再次启动覆盖（快照语义）', () => {
    const store = new LastLaunchStore(baseDir)
    store.setLaunch({ version: '1.0.0', build: '', timestamp: '2026-08-06T00:00:00.000Z' })
    store.setLaunch({ version: '1.1.0', build: '', timestamp: '2026-08-07T00:00:00.000Z' })
    expect(store.getLastLaunch()?.version).toBe('1.1.0')
  })

  it('新实例读回上次启动快照（重启持久化）', () => {
    new LastLaunchStore(baseDir).setLaunch({
      version: '1.0.0',
      build: '',
      timestamp: '2026-08-06T00:00:00.000Z'
    })
    const reloaded = new LastLaunchStore(baseDir)
    expect(reloaded.getLastLaunch()).toEqual({
      version: '1.0.0',
      build: '',
      timestamp: '2026-08-06T00:00:00.000Z'
    })
  })

  it('损坏文件：getLastLaunch 返回 null 不抛错', () => {
    writeFileSync(join(baseDir, 'last-launch.json'), '{corrupted', 'utf-8')
    const store = new LastLaunchStore(baseDir)
    expect(store.getLastLaunch()).toBeNull()
    expect(existsSync(join(baseDir, 'last-launch.json'))).toBe(true) // 保留原文件
  })
})
