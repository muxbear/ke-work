import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSourceFactory } from '../../../src/main/database/DataSourceFactory'

describe('DataSourceFactory', () => {
  let factory: DataSourceFactory

  beforeEach(() => {
    DataSourceFactory.resetForTest()
    factory = DataSourceFactory.getInstance()
    factory.configure({ localDbPath: ':memory:' })
  })

  afterEach(() => {
    factory.close()
    DataSourceFactory.resetForTest()
  })

  it('DSF-01: 单例', () => {
    expect(DataSourceFactory.getInstance()).toBe(factory)
  })

  it('DSF-02: local 模式创建 Local 实现', () => {
    factory.setMode('local')
    expect(factory.createConfigRepository().constructor.name).toBe('LocalConfigRepository')
    expect(factory.createConversationRepository().constructor.name).toBe(
      'LocalConversationRepository'
    )
  })

  it('DSF-04: auth repository 可创建', () => {
    factory.setMode('local')
    expect(factory.createAuthRepository().constructor.name).toBe('LocalAuthRepository')
  })

  it('DSF-03: cloud 模式可切换（云端实现迭代 3 提供）', () => {
    factory.setMode('cloud')
    expect(factory.getMode()).toBe('cloud')
  })

  it('WM-04: setMode 通知订阅者且能获取对应实现', () => {
    const listener = vi.fn()
    factory.onModeChanged(listener)
    factory.setMode('cloud')
    expect(listener).toHaveBeenCalledWith('cloud')
    factory.setMode('local')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('create 方法按当前模式返回实现', () => {
    factory.setMode('local')
    const local = factory.createConfigRepository()
    expect(local.constructor.name).toBe('LocalConfigRepository')
  })
})
