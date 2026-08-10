import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationStore } from '../../../src/main/agent/ConversationStore'
import type { CheckpointTuple } from '@langchain/langgraph-checkpoint'
import { LocalDataSource } from '../../../src/main/database/local/LocalDataSource'

/** 构造 CheckpointTuple（简化版，贴近 JsonPlusSerializer 反序列化结果） */
function makeTuple(
  threadId: string,
  messages: Array<{ id: string; role: string; content: unknown }>,
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

  it('listConversations 同一会话多个 checkpoint（图的每步保存）去重为 1 个', async () => {
    // 一次消息发送产生多个 checkpoint（LangGraph 每步保存），SqliteSaver.list 全部返回
    const tuples = [
      makeTuple('u:u1:c1', [{ id: 'm1', role: 'human', content: '第一步' }], new Date(100)),
      makeTuple(
        'u:u1:c1',
        [
          { id: 'm1', role: 'human', content: '第一步' },
          { id: 'm2', role: 'ai', content: '回复' }
        ],
        new Date(200)
      ),
      makeTuple(
        'u:u1:c1',
        [
          { id: 'm1', role: 'human', content: '第一步' },
          { id: 'm2', role: 'ai', content: '回复' },
          { id: 'm3', role: 'human', content: '追问' }
        ],
        new Date(300)
      )
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)

    const list = await store.listConversations('u1')
    expect(list).toHaveLength(1) // 同一 thread 只保留最新
    expect(list[0].id).toBe('c1')
    expect(list[0].updateAt).toBe(300)
  })

  it('listConversations 标题派生：首条 user 消息前 20 字符截断', async () => {
    const longContent = '这是一条非常非常非常非常非常非常非常非常非常非常非常长的消息内容'
    expect(longContent.length).toBeGreaterThan(20)
    const tuples = [
      makeTuple('u:u1:c1', [
        { id: 'm1', role: 'system', content: '系统提示' },
        { id: 'm2', role: 'human', content: longContent }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)

    const list = await store.listConversations('u1')
    expect(list[0].title).toBe(`${longContent.slice(0, 20)}...`)
  })

  it('listConversations 标题派生：user 消息 content 为 blocks 数组时解析文本', async () => {
    // 新版 LangChain 序列化后 user 消息 content 可能为 blocks 数组
    const tuples = [
      makeTuple('u:u1:c1', [
        { id: 'm1', role: 'human', content: [{ type: 'text', text: '帮我写一个项目方案' }] }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)

    const list = await store.listConversations('u1')
    expect(list[0].title).toBe('帮我写一个项目方案')
  })

  it('saveAutoTitle 写入且不覆盖用户手动重命名', async () => {
    const ds = new LocalDataSource(':memory:')
    const tuples = [
      makeTuple('u:u1:c1', [{ id: 'm1', role: 'human', content: '原始消息' }], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never, () => ds.getDb())

    store.saveAutoTitle('u1', 'c1', 'AI 总结标题')
    const list1 = await store.listConversations('u1')
    expect(list1[0].title).toBe('AI 总结标题')

    // 手动重命名后，后续 AI 总结不再覆盖（INSERT OR IGNORE）
    await store.renameConversation('u1', 'c1', '手动标题')
    store.saveAutoTitle('u1', 'c1', '新 AI 标题')
    const list2 = await store.listConversations('u1')
    expect(list2[0].title).toBe('手动标题')
    ds.close()
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

  it('bindWorkspace 落库后 listConversations 从业务表读绑定（checkpoint metadata 无 workspace 也可）', async () => {
    const ds = new LocalDataSource(':memory:')
    const tuples = [
      makeTuple('u:u1:c1', [{ id: 'm1', role: 'human', content: '绑定业务表' }], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never, () => ds.getDb())

    // 模拟 agent:send 时主进程落库绑定（checkpoint metadata 里没有 workspace——LangGraph 实测不持久化）
    store.bindWorkspace('u1', 'c1', { id: 'ws-2', name: '我的工作空间', dir: '/tmp/我的工作空间' })

    const list = await store.listConversations('u1')
    expect(list[0].workspace).toEqual({ id: 'ws-2', name: '我的工作空间', dir: '/tmp/我的工作空间' })
    expect(await store.getWorkspace('u1', 'c1')).toEqual({
      id: 'ws-2',
      name: '我的工作空间',
      dir: '/tmp/我的工作空间'
    })

    // 绑定表优先于 checkpoint metadata（两者同时存在时以业务表为准）
    const boundTuple = makeTuple(
      'u:u1:c1',
      [{ id: 'm1', role: 'human', content: 'x' }],
      new Date(200),
      new Date(200),
      { id: 'ws-1', name: '旧绑定' }
    )
    const store2 = new ConversationStore(() => makeCheckpointer([boundTuple]) as never, () => ds.getDb())
    const list2 = await store2.listConversations('u1')
    expect(list2[0].workspace?.id).toBe('ws-2') // 业务表 wins

    // 未选择工作空间（null）时移除绑定
    store.bindWorkspace('u1', 'c1', null)
    const list3 = await store.listConversations('u1')
    expect(list3[0].workspace).toBeNull()
    ds.close()
  })

  it('deleteConversation 同时清理工作空间绑定记录', async () => {
    const ds = new LocalDataSource(':memory:')
    const tuples = [
      makeTuple('u:u1:c1', [{ id: 'm1', role: 'human', content: '待删' }], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never, () => ds.getDb())
    store.bindWorkspace('u1', 'c1', { id: 'ws-2', name: '我的工作空间' })

    await store.deleteConversation('u1', 'c1')
    const row = ds
      .getDb()
      .prepare('SELECT COUNT(*) AS c FROM conversation_workspaces WHERE user_id = ? AND conversation_id = ?')
      .get('u1', 'c1') as { c: number }
    expect(row.c).toBe(0)
    ds.close()
  })

  it('getMessages 解析 AI 消息块（text 拼接为正文、reasoning 提取为思考）', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [
        { id: 'msg-1', role: 'human', content: '你叫什么名字？' },
        {
          id: 'msg-2',
          role: 'ai',
          content: [
            { type: 'reasoning', reasoning: '第一步思考' },
            { type: 'text', text: '**你好**，我是 AI 助手。' },
            { type: 'tool_use', id: 'call_1', name: 'ls', input: {} },
            { type: 'reasoning', reasoning: '第二步思考' },
            { type: 'text', text: '有什么可以帮你？' }
          ]
        }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)

    const messages = await store.getMessages('u1', 'c1')
    expect(messages).toEqual([
      { id: 'msg-1', role: 'user', content: '你叫什么名字？' },
      {
        id: 'msg-2',
        role: 'assistant',
        content: '**你好**，我是 AI 助手。有什么可以帮你？',
        reasoning: '第一步思考\n第二步思考',
        rawContent: [
          { type: 'reasoning', reasoning: '第一步思考' },
          { type: 'text', text: '**你好**，我是 AI 助手。' },
          { type: 'tool_use', id: 'call_1', name: 'ls', input: {} },
          { type: 'reasoning', reasoning: '第二步思考' },
          { type: 'text', text: '有什么可以帮你？' }
        ]
      }
    ])
  })

  it('getMessages 处理空数组/非法 content（不抛错、返回空字符串）', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [
        { id: 'msg-1', role: 'human', content: 'hi' },
        { id: 'msg-2', role: 'ai', content: [] },
        { id: 'msg-3', role: 'ai', content: 42 },
        { id: 'msg-4', role: 'ai', content: null }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)

    const messages = await store.getMessages('u1', 'c1')
    expect(messages.filter((m) => m.role === 'assistant').map((m) => m.content)).toEqual([
      '',
      '',
      ''
    ])
  })

  it('getMessages string content 原样返回（旧格式/用户消息，无 reasoning）', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [
        { id: 'msg-1', role: 'human', content: '你好' },
        { id: 'msg-2', role: 'ai', content: '你好！有什么可以帮你？' }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)

    const messages = await store.getMessages('u1', 'c1')
    expect(messages[1]).toEqual({ id: 'msg-2', role: 'assistant', content: '你好！有什么可以帮你？' })
  })

  it('deleteConversation 用合成 thread_id 调 deleteThread', async () => {
    const cp = makeCheckpointer([])
    const store = new ConversationStore(() => cp as never)

    await store.deleteConversation('u1', 'c9')

    expect(cp.deleteThread).toHaveBeenCalledWith('u:u1:c9')
  })
})

describe('ConversationStore 自定义标题（conversation_titles 表）', () => {
  let ds: LocalDataSource

  beforeEach(() => {
    ds = new LocalDataSource(':memory:')
  })

  afterEach(() => {
    ds.close()
  })

  it('renameConversation 后 listConversations 标题优先于派生标题', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [{ id: 'm1', role: 'human', content: '原始问题内容' }], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never, () => ds.getDb())

    await store.renameConversation('u1', 'c1', '自定义标题')
    const list = await store.listConversations('u1')

    expect(list[0].title).toBe('自定义标题')
  })

  it('未重命名的会话标题仍由首条消息派生', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [{ id: 'm1', role: 'human', content: '派生标题来源' }], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never, () => ds.getDb())

    const list = await store.listConversations('u1')
    expect(list[0].title).toBe('派生标题来源')
  })

  it('renameConversation 标题为空/纯空格抛错', async () => {
    const store = new ConversationStore(() => makeCheckpointer([]) as never, () => ds.getDb())
    await expect(store.renameConversation('u1', 'c1', '   ')).rejects.toThrow(/不能为空/)
  })

  it('deleteConversation 联动删除自定义标题记录', async () => {
    const store = new ConversationStore(() => makeCheckpointer([]) as never, () => ds.getDb())

    await store.renameConversation('u1', 'c1', '临时标题')
    await store.deleteConversation('u1', 'c1')

    const row = ds
      .getDb()
      .prepare('SELECT * FROM conversation_titles WHERE user_id = ? AND conversation_id = ?')
      .get('u1', 'c1')
    expect(row).toBeUndefined()
  })

  it('deleteConversationsByWorkspace 删除绑定该空间的所有会话并返回数量', async () => {
    const ds = new LocalDataSource(':memory:')
    const tuples = [
      makeTuple('u:u1:c1', [{ id: 'm1', role: 'human', content: 'A' }], new Date(100)),
      makeTuple('u:u1:c2', [{ id: 'm1', role: 'human', content: 'B' }], new Date(200)),
      makeTuple('u:u1:c3', [{ id: 'm1', role: 'human', content: 'C' }], new Date(300))
    ]
    const cp = makeCheckpointer(tuples)
    const store = new ConversationStore(() => cp as never, () => ds.getDb())
    store.bindWorkspace('u1', 'c1', { id: 'ws-2', name: '空间B' })
    store.bindWorkspace('u1', 'c2', { id: 'ws-2', name: '空间B' })
    store.bindWorkspace('u1', 'c3', { id: 'ws-1', name: '空间A' })

    const deleted = await store.deleteConversationsByWorkspace('u1', 'ws-2')

    expect(deleted).toBe(2)
    // ws-2 的两个会话：checkpoint 已删，其他空间会话不受影响
    expect(cp.deleteThread).toHaveBeenCalledWith('u:u1:c1')
    expect(cp.deleteThread).toHaveBeenCalledWith('u:u1:c2')
    expect(cp.deleteThread).not.toHaveBeenCalledWith('u:u1:c3')
    const c1Row = ds
      .getDb()
      .prepare(
        'SELECT COUNT(*) AS c FROM conversation_workspaces WHERE user_id = ? AND conversation_id = ?'
      )
      .get('u1', 'c1') as { c: number }
    expect(c1Row.c).toBe(0)
    // ws-1 的会话绑定不受影响
    const c3Row = ds
      .getDb()
      .prepare(
        'SELECT COUNT(*) AS c FROM conversation_workspaces WHERE user_id = ? AND conversation_id = ?'
      )
      .get('u1', 'c3') as { c: number }
    expect(c3Row.c).toBe(1)
    ds.close()
  })

  it('deleteConversationsByWorkspace 无绑定会话返回 0', async () => {
    const ds = new LocalDataSource(':memory:')
    const store = new ConversationStore(() => makeCheckpointer([]) as never, () => ds.getDb())
    const deleted = await store.deleteConversationsByWorkspace('u1', 'ws-9')
    expect(deleted).toBe(0)
    ds.close()
  })

  it('deleteConversationsByWorkspace 无 db 时返回 0 且不调 deleteThread', async () => {
    const cp = makeCheckpointer([])
    const store = new ConversationStore(() => cp as never)
    const deleted = await store.deleteConversationsByWorkspace('u1', 'ws-1')
    expect(deleted).toBe(0)
    expect(cp.deleteThread).not.toHaveBeenCalled()
  })
})

describe('getMessages 折叠文件附件块（📎 文件名）', () => {
  it('文本文件块 → 仅留 📎 文件名（内容不进入 UI 文本）', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [
        {
          id: 'm1',
          role: 'human',
          content: [
            { type: 'text', text: '请看看这个文件' },
            { type: 'text', text: '【文件：报告.md】\n正文内容\n【文件内容结束】' }
          ]
        }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)
    const messages = await store.getMessages('u1', 'c1')
    expect(messages[0].content).toBe('请看看这个文件📎 报告.md')
    expect(messages[0].rawContent).toBeDefined()
    expect((messages[0].rawContent as unknown[]).length).toBe(2)
  })

  it('图片二元组（标记块 + image_url）→ 单个 📎 文件名', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [
        {
          id: 'm1',
          role: 'human',
          content: [
            { type: 'text', text: '看这张图' },
            { type: 'text', text: '【文件：图.png】' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } }
          ]
        }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)
    const messages = await store.getMessages('u1', 'c1')
    expect(messages[0].content).toBe('看这张图📎 图.png')
  })

  it('普通文本块行为不变（回归）', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [
        { id: 'm1', role: 'human', content: [{ type: 'text', text: '普通文本' }] }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)
    const messages = await store.getMessages('u1', 'c1')
    expect(messages[0].content).toBe('普通文本')
    expect(messages[0].rawContent).toBeDefined()
  })

  it('string content（旧数据）无 rawContent 字段', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [{ id: 'm1', role: 'human', content: '旧格式文本' }], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)
    const messages = await store.getMessages('u1', 'c1')
    expect(messages[0].content).toBe('旧格式文本')
    expect(messages[0].rawContent).toBeUndefined()
  })

  it('游离 image_url（无标记块前置）→ 📎 图片', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [
        {
          id: 'm1',
          role: 'human',
          content: [
            { type: 'text', text: '说明' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } }
          ]
        }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)
    const messages = await store.getMessages('u1', 'c1')
    expect(messages[0].content).toBe('说明📎 图片')
  })

  it('标记块后 tool_use 重置消费状态，后续 image_url 独立显示', async () => {
    const tuples = [
      makeTuple('u:u1:c1', [
        {
          id: 'm1',
          role: 'human',
          content: [
            { type: 'text', text: '【文件：图.png】' },
            { type: 'tool_use', id: 't', name: 'x', input: {} },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } }
          ]
        }
      ], new Date(100))
    ]
    const store = new ConversationStore(() => makeCheckpointer(tuples) as never)
    const messages = await store.getMessages('u1', 'c1')
    expect(messages[0].content).toBe('📎 图.png📎 图片')
  })
})
