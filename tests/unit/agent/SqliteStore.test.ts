import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SqliteStore } from '../../../src/main/agent/SqliteStore'

describe('SqliteStore（参考 PostgresStore 移植的 SQLite 长期记忆）', () => {
  let dir: string
  let store: SqliteStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kw-store-'))
    store = SqliteStore.fromConnString(join(dir, 'store.sqlite'))
    await store.setup()
  })

  afterEach(async () => {
    await store.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('put/get 持久化往返（namespace join(:) 编码 + JSON 序列化）', async () => {
    await store.put(['user', 'u1'], 'mem-1', { value: 'hello', score: 1 })
    const item = await store.get(['user', 'u1'], 'mem-1')
    expect(item).not.toBeNull()
    expect(item!.key).toBe('mem-1')
    expect(item!.value).toEqual({ value: 'hello', score: 1 })
    expect(item!.namespace).toEqual(['user', 'u1'])
    expect(item!.createdAt).toBeInstanceOf(Date)
    expect(item!.updatedAt).toBeInstanceOf(Date)
  })

  it('get 不存在返回 null', async () => {
    expect(await store.get(['user'], 'missing')).toBeNull()
  })

  it('put UPSERT 语义：重复 key 覆盖 value 并刷新 updated_at', async () => {
    await store.put(['ns'], 'k', { v: 1 })
    const first = await store.get(['ns'], 'k')
    await new Promise((r) => setTimeout(r, 5))
    await store.put(['ns'], 'k', { v: 2 })
    const second = await store.get(['ns'], 'k')
    expect(second!.value).toEqual({ v: 2 })
    expect(second!.updatedAt.getTime()).toBeGreaterThanOrEqual(first!.updatedAt.getTime())
    // 同 key 仅一行
    expect((await store.listNamespaces()).length).toBe(1)
  })

  it('delete 移除条目（put null 等价）', async () => {
    await store.put(['ns'], 'k1', { v: 1 })
    await store.delete(['ns'], 'k1')
    expect(await store.get(['ns'], 'k1')).toBeNull()
  })

  it('namespace 校验：空数组抛错', async () => {
    await expect(store.put([], 'k', { v: 1 })).rejects.toThrow(/namespace/i)
  })

  it('search 文本降级：前缀匹配 + query 内容匹配 + filter 过滤 + 分页', async () => {
    await store.put(['user', 'u1'], 'a', { type: 'report', text: 'alpha' })
    await store.put(['user', 'u1'], 'b', { type: 'report', text: 'beta' })
    await store.put(['user', 'u2'], 'c', { type: 'note', text: 'alpha' })

    // namespace 前缀过滤
    const r1 = await store.search(['user', 'u1'])
    expect(r1.map((i) => i.key).sort()).toEqual(['a', 'b'])

    // query 内容匹配
    const r2 = await store.search(['user'], { query: 'alpha' })
    expect(r2.map((i) => i.key).sort()).toEqual(['a', 'c'])

    // filter 顶层字段过滤
    const r3 = await store.search(['user'], { filter: { type: 'report' } })
    expect(r3.map((i) => i.key).sort()).toEqual(['a', 'b'])

    // 分页
    const r4 = await store.search(['user'], { limit: 1, offset: 0 })
    expect(r4).toHaveLength(1)
  })

  it('listNamespaces 前缀/后缀匹配 + maxDepth + 排序', async () => {
    await store.put(['user', 'u1'], 'k1', { v: 1 })
    await store.put(['user', 'u1', 'deep'], 'k2', { v: 2 })
    await store.put(['docs'], 'k3', { v: 3 })

    const all = await store.listNamespaces()
    expect(all).toEqual([['docs'], ['user', 'u1'], ['user', 'u1', 'deep']])

    const prefixed = await store.listNamespaces({ prefix: ['user'] })
    expect(prefixed).toEqual([['user', 'u1'], ['user', 'u1', 'deep']])

    const shallow = await store.listNamespaces({ prefix: ['user'], maxDepth: 2 })
    expect(shallow).toEqual([['user', 'u1']])
  })

  it('重启后数据仍在（持久化验证）', async () => {
    await store.put(['ns'], 'persist', { v: 'x' })
    await store.stop()
    const reopened = SqliteStore.fromConnString(join(dir, 'store.sqlite'))
    const item = await reopened.get(['ns'], 'persist')
    expect(item?.value).toEqual({ v: 'x' })
    await reopened.stop()
  })

  it('batch 按操作类型分发', async () => {
    const results = await store.batch([
      { namespace: ['ns'], key: 'k', value: { v: 1 } },
      { namespace: ['ns'], key: 'k' }
    ] as never)
    // put 后 get 返回写入值
    expect((results[1] as { value: { v: number } }).value).toEqual({ v: 1 })
  })
})
