import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { WorkModeStore, type WorkMode } from '../../../src/main/mode/work-mode'

describe('WorkModeStore', () => {
  let dir: string
  let store: WorkModeStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kw-mode-'))
    store = new WorkModeStore(dir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('WM-01: 空配置时默认 local', () => {
    expect(store.getMode()).toBe('local')
  })

  it('WM-02: 模式持久化，重启后仍保持', () => {
    store.setMode('cloud')
    const reloaded = new WorkModeStore(dir)
    expect(reloaded.getMode()).toBe('cloud')
  })

  it('WM-03: 非法模式值降级为 local 并修复文件', () => {
    // 先写入非法文件，再构造 store（load 发生在构造函数中）
    writeFileSync(join(dir, 'work-mode.json'), JSON.stringify({ mode: 'bogus' }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fresh = new WorkModeStore(dir)
    expect(fresh.getMode()).toBe('local')
    expect(warnSpy).toHaveBeenCalled()
    const persisted = JSON.parse(readFileSync(join(dir, 'work-mode.json'), 'utf-8'))
    expect(persisted.mode).toBe('local')
  })

  it('WM-04: setMode 通知订阅者', () => {
    const listener = vi.fn()
    const unsubscribe = store.onModeChanged(listener)
    store.setMode('cloud')
    expect(listener).toHaveBeenCalledWith('cloud')
    unsubscribe()
    store.setMode('local')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('setMode 校验非法值', () => {
    expect(() => store.setMode('bogus' as WorkMode)).toThrow(/invalid mode/)
  })
})
