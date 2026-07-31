import { beforeEach, describe, expect, it } from 'vitest'
import { LocalDataSource } from '../../../src/main/database/local/LocalDataSource'
import { LocalConfigRepository } from '../../../src/main/database/local/LocalConfigRepository'

describe('LocalConfigRepository', () => {
  let repo: LocalConfigRepository

  beforeEach(() => {
    repo = new LocalConfigRepository(new LocalDataSource(':memory:'))
  })

  it('LS-07a: set 后 get 返回原值', async () => {
    await repo.set('workMode', 'cloud')
    expect(await repo.get('workMode')).toBe('cloud')
  })

  it('LS-07b: 未设置时 get 返回 null', async () => {
    expect(await repo.get('not-exist')).toBeNull()
  })

  it('LS-07c: delete 后 get 为 null', async () => {
    await repo.set('k', 'v')
    await repo.delete('k')
    expect(await repo.get('k')).toBeNull()
  })

  it('LS-07d: getAll 返回全部键值', async () => {
    await repo.set('a', '1')
    await repo.set('b', '2')
    expect(await repo.getAll()).toEqual({ a: '1', b: '2' })
  })

  it('LS-07e: 重复 set 覆盖旧值', async () => {
    await repo.set('k', 'v1')
    await repo.set('k', 'v2')
    expect(await repo.get('k')).toBe('v2')
  })
})
