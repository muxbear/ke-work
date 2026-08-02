import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalDataSource } from '../../../src/main/database/local/LocalDataSource'
import { WorkspaceRepository } from '../../../src/main/workspace/WorkspaceRepository'

describe('WorkspaceRepository（workspaces 表）', () => {
  let ds: LocalDataSource
  let repo: WorkspaceRepository

  beforeEach(() => {
    ds = new LocalDataSource(':memory:')
    repo = new WorkspaceRepository(ds.getDb())
  })

  afterEach(() => {
    ds.close()
  })

  it('WSR-01: migration v4 生效（user_version=4 且表存在）', () => {
    expect(ds.getDb().pragma('user_version', { simple: true })).toBe(4)
    const tables = ds
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'")
      .get()
    expect(tables).toBeTruthy()
  })

  it('WSR-02: create + getById 往返一致', () => {
    const ws = repo.create({ name: '项目A', path: '/tmp/ke/项目A', source: 'created' })
    const got = repo.getById(ws.id)
    expect(got).toEqual(ws)
  })

  it('WSR-03: findByPath 命中/未命中', () => {
    repo.create({ name: '外部', path: '/data/external', source: 'external' })
    expect(repo.findByPath('/data/external')?.name).toBe('外部')
    expect(repo.findByPath('/nope')).toBeUndefined()
  })

  it('WSR-04: list 按创建时间降序', () => {
    const a = repo.create({ name: 'A', path: '/tmp/a', source: 'created' })
    const b = repo.create({ name: 'B', path: '/tmp/b', source: 'created' })
    const rows = repo.list()
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id])
  })

  it('WSR-05: path 唯一约束（重复路径抛错）', () => {
    repo.create({ name: 'A', path: '/tmp/same', source: 'created' })
    expect(() =>
      repo.create({ name: 'B', path: '/tmp/same', source: 'timestamp' })
    ).toThrow()
  })

  it('WSR-06: delete 删除记录', () => {
    const ws = repo.create({ name: 'A', path: '/tmp/a', source: 'created' })
    repo.delete(ws.id)
    expect(repo.getById(ws.id)).toBeUndefined()
  })
})
