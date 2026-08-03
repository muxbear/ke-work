import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalDataSource } from '../../../src/main/database/local/LocalDataSource'
import { WorkspaceRepository } from '../../../src/main/workspace/WorkspaceRepository'
import type { WorkspaceRow } from '../../../src/main/workspace/types'

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

  it('WSR-01: migration v4-v7 生效（user_version=7，workspaces 含 user_id 列）', () => {
    expect(ds.getDb().pragma('user_version', { simple: true })).toBe(7)
    const titles = ds
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_titles'")
      .get()
    expect(titles).toBeTruthy()
    const wsBindings = ds
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_workspaces'")
      .get()
    expect(wsBindings).toBeTruthy()
    const cols = ds
      .getDb()
      .prepare('PRAGMA table_info(workspaces)')
      .all() as Array<{ name: string }>
    expect(cols.map((c) => c.name)).toContain('user_id')
  })

  it('WSR-02: create + getById 往返一致（含 userId）', () => {
    const ws = repo.create({ name: '项目A', path: '/tmp/ke/项目A', source: 'created', userId: 'u1' })
    const got = repo.getById(ws.id, 'u1')
    expect(got).toEqual(ws)
    expect(got?.userId).toBe('u1')
  })

  it('WSR-03: findByPath 命中/未命中（全局无用户过滤）', () => {
    repo.create({ name: '外部', path: '/data/external', source: 'external', userId: 'u1' })
    expect(repo.findByPath('/data/external')?.name).toBe('外部')
    expect(repo.findByPath('/nope')).toBeUndefined()
  })

  it('WSR-04: listForUser 按创建时间降序', () => {
    const a = repo.create({ name: 'A', path: '/tmp/a', source: 'created', userId: 'u1' })
    const b = repo.create({ name: 'B', path: '/tmp/b', source: 'created', userId: 'u1' })
    const rows = repo.listForUser('u1')
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id])
  })

  it('WSR-05: path 唯一约束（重复路径抛错）', () => {
    repo.create({ name: 'A', path: '/tmp/same', source: 'created', userId: 'u1' })
    expect(() =>
      repo.create({ name: 'B', path: '/tmp/same', source: 'timestamp', userId: 'u2' })
    ).toThrow()
  })

  it('WSR-06: delete 删除本人记录', () => {
    const ws = repo.create({ name: 'A', path: '/tmp/a', source: 'created', userId: 'u1' })
    expect(repo.delete(ws.id, 'u1')).toBe(1)
    expect(repo.getById(ws.id, 'u1')).toBeUndefined()
  })

  it('WSR-07: listForUser 只返回本用户记录（用户隔离）', () => {
    repo.create({ name: 'u1-A', path: '/tmp/u1a', source: 'created', userId: 'u1' })
    repo.create({ name: 'u2-A', path: '/tmp/u2a', source: 'created', userId: 'u2' })
    const rows = repo.listForUser('u1')
    expect(rows.map((r) => r.name)).toEqual(['u1-A'])
  })

  it('WSR-08: 无主记录被首个用户接管（幂等，默认空间除外）', () => {
    // 预置无主旧数据（user_id NULL）与默认空间记录
    const orphan = repo.create({ name: '旧数据', path: '/tmp/old', source: 'created', userId: null })
    const def = repo.create({
      name: '默认工作空间',
      path: '/tmp/DefaultWorkspace',
      source: 'default',
      userId: null
    })
    // 首次加载：NULL 非 default 记录归属 u1，default 保持共享
    const rowsU1 = repo.listForUser('u1')
    expect(rowsU1.map((r) => r.id)).toEqual(expect.arrayContaining([orphan.id, def.id]))
    const orphanNow = repo.findByPath('/tmp/old')
    expect(orphanNow?.userId).toBe('u1')
    const defNow = repo.findByPath('/tmp/DefaultWorkspace')
    expect(defNow?.userId).toBeNull()
    // 幂等：u2 接管不到已归属 u1 的记录
    const rowsU2 = repo.listForUser('u2')
    expect(rowsU2.map((r) => r.id)).toEqual([def.id])
    expect(repo.findByPath('/tmp/old')?.userId).toBe('u1')
  })

  it('WSR-09: 默认空间记录对任意用户可见（机器级共享）', () => {
    const def = repo.create({
      name: '默认工作空间',
      path: '/tmp/DefaultWorkspace',
      source: 'default',
      userId: null
    })
    expect(repo.listForUser('u1').map((r) => r.id)).toContain(def.id)
    expect(repo.listForUser('u2').map((r) => r.id)).toContain(def.id)
    expect(repo.getById(def.id, 'u1')?.source).toBe('default')
  })

  it('WSR-10: 跨用户 delete 不生效（changes=0）', () => {
    const ws = repo.create({ name: 'A', path: '/tmp/a', source: 'created', userId: 'u1' })
    expect(repo.delete(ws.id, 'u2')).toBe(0)
    expect(repo.getById(ws.id, 'u1')).toBeDefined()
  })

  it('WSR-11: adoptByPath 定向接管无主记录', () => {
    repo.create({ name: '外部', path: '/data/shared', source: 'external', userId: null })
    repo.adoptByPath('/data/shared', 'u1')
    expect(repo.findByPath('/data/shared')?.userId).toBe('u1')
    // 已归属后幂等（不覆盖）
    repo.adoptByPath('/data/shared', 'u2')
    expect((repo.findByPath('/data/shared') as WorkspaceRow).userId).toBe('u1')
  })
})
