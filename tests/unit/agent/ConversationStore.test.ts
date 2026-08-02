import { describe, expect, it, vi } from 'vitest'
import { ConversationStore } from '../../../src/main/agent/ConversationStore'
import type { CheckpointTuple } from '@langchain/langgraph-checkpoint'

/** 构造 CheckpointTuple（简化版，贴近 JsonPlusSerializer 反序列化结果） */
function makeTuple(
  threadId: string,
  messages: Array<{ id: string; role: string; content: string }>,
  updatedAt: Date,
  createdAt: Date = updatedAt,
  workspace?: { id: string; name: string; dir?: string } | null
): CheckpointTuple {
  return {
    config: { configurable: { thread_id: threadId } },
    checkpoint: { channel_values: { messages }, checkpoint_id: '', type: '' },
    metadata: {
      source: 'loop',
      step: 1,
      parents: {},
      created_at: createdAt,
      updated_at: updatedAt,
      ...(workspace !== undefined ? { workspace } : {})
    }
  } as unknown as CheckpointTuple
}

function makeCheckpointer(
  tuples: CheckpointTuple[]
): {
  list: () => AsyncGenerator<CheckpointTuple>
  getTuple: (config: { configurable: { thread_id: string } }) => Promise<CheckpointTuple | undefined>
  deleteThread: (threadId: string) => Promise<void>
} {
  return {
    list: vi.fn(async function* () {
      for (const t of tuples) yield t
    }),
    getTuple: vi.fn(async (config: { configurable: { thread_id: string } }) => {
      return tuples.find((t) => t.config.configurable?.thread_id === config.configurable.thread_id) ?? undefined
    }),
    deleteThread: vi.fn(async () => {})
  }
}

describe('ConversationStore（基于 LangGraph checkpointer 的会话服务）', () => {
  it('buildThreadId 按 userId 合成 u:{userId}:{conversationId}', () => {
    const store = new ConversationStore(() => makeCheckpointer([]) as never)
    expect(store.buildThreadId('u1', 'c1')).toBe('u:u1:c1')
  })

  it('listConversations 过滤用户前缀并按 updated_at 降序', async () => {
    const tuples = [
      makeTuple('u:u2:c-old', [{ id: 'm1', role: 'human', content: '别人的' }], new Date(100)),
      makeTuple('u:u1:c2', [{ id: 'm1', role: 'human', content: '第二个' }], new Date(300)),
      makeTuple('u:u1:c1', [{ id: 'm1', role: 'human', content: '第一个' }], new Date(200))
    ]
    const cp = makeCheckpointer(tuples)
    const store = new ConversationStore(() => cp as never)

    const list = await store.listConversations('u1')

    expect(cp.list).toHaveBeenCalled()
    expect(list.map((c) => c.id)).toEqual(['c2', 'c1']) // 仅 u1 前缀 + 时间降序
    expect(list[0].updateAt).toBe(300)
  })

  it('listConversations 标题派生：首条 user 消息前 30 字符截断', async () => {
    const longContent = '这是一条非常非常非常非常非常非常非常非常非常非常非常长的消息内容'
    expect(longContent.length).toBeGreaterThan(30)
    const tuples = [
      makeTuple('u:u1:c1', [
        { id: 'm1', role: 'system', content: '系统提示' },
        { id: 'm2', role: 'human', content: longContent }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)

    const list = await store.listConversations('u1')
    expect(list[0].title).toBe(`${longContent.slice(0, 30)}...`)
  })

  it('listConversations 无消息时标题为默认', async () => {
    const tuples = [makeTuple('u:u1:c1', [], new Date(100))]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)
    const list = await store.listConversations('u1')
    expect(list[0].title).toBe('新对话')
  })

  it('getMessages 映射 human/ai → user/assistant 并保留 id 与 content', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [
        { id: 'msg-1', role: 'human', content: '你好' },
        { id: 'msg-2', role: 'ai', content: '你好！有什么可以帮你？' }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)

    const messages = await store.getMessages('u1', 'c1')
    expect(messages).toEqual([
      { id: 'msg-1', role: 'user', content: '你好' },
      { id: 'msg-2', role: 'assistant', content: '你好！有什么可以帮你？' }
    ])
  })

  it('getMessages 会话不存在返回空数组', async () => {
    const store = new ConversationStore(() => makeCheckpointer([]) as never)
    expect(await store.getMessages('u1', 'nonexistent')).toEqual([])
  })

  it('listConversations 透出工作空间绑定（无绑定为 null）', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [{ id: 'm1', role: 'human', content: '绑定空间' }], new Date(200), new Date(200), {
        id: 'ws-1',
        name: '项目A',
        dir: '/tmp/项目A'
      }),
      makeTuple('u:u1:c2', [{ id: 'm1', role: 'human', content: '无绑定' }], new Date(300))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)

    const list = await store.listConversations('u1')
    const c1 = list.find((c) => c.id === 'c1')!
    const c2 = list.find((c) => c.id === 'c2')!
    expect(c1.workspace).toEqual({ id: 'ws-1', name: '项目A', dir: '/tmp/项目A' })
    expect(c2.workspace).toBeNull()
  })

  it('getWorkspace 返回会话绑定（旧会话无绑定返回 null）', async () => {
    const bound = makeTuple('u:u1:c1', [{ id: 'm1', role: 'human', content: 'hi' }], new Date(100), new Date(100), {
      id: 'ws-1',
      name: '项目A'
    })
    const unbound = makeTuple('u:u1:c2', [{ id: 'm1', role: 'human', content: 'hi' }], new Date(100))
    const store = new ConversationStore(() => makeCheckpointer([bound, unbound]) as never)

    expect(await store.getWorkspace('u1', 'c1')).toEqual({ id: 'ws-1', name: '项目A', dir: undefined })
    expect(await store.getWorkspace('u1', 'c2')).toBeNull()
    expect(await store.getWorkspace('u1', 'nonexistent')).toBeNull()
  })

  it('deleteConversation 用合成 thread_id 调 deleteThread', async () => {
    const cp = makeCheckpointer([])
    const store = new ConversationStore(() => cp as never)

    await store.deleteConversation('u1', 'c9')

    expect(cp.deleteThread).toHaveBeenCalledWith('u:u1:c9')
  })
})
