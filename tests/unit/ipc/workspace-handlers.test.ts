import { describe, expect, it, vi } from 'vitest'
import {
  registerWorkspaceHandlers,
  type WorkspaceHandlerDeps
} from '../../../src/main/ipc/workspace-handlers'
import { SessionService } from '../../../src/main/services/SessionService'

function createFakeIpcMain(): {
  handle: ReturnType<typeof vi.fn>
  handlers: Map<string, (...args: unknown[]) => unknown>
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
} {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    handlers,
    async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
      return handlers.get(channel)!({} as never, ...args) as T
    }
  }
}

const fakeWorkspace = {
  id: 'ws-1',
  name: '项目A',
  path: '/tmp/项目A',
  source: 'created',
  userId: 'real-user',
  createdAt: 1
}

const fakeDefault = {
  id: 'ws-default',
  name: '默认工作空间',
  path: '/tmp/DefaultWorkspace',
  source: 'default',
  userId: null,
  createdAt: 1
}

/** 测试依赖：真实 SessionService（纯内存模式）+ mock workspaceService；默认已登录 */
function createDeps(
  overrides: Record<string, unknown> = {},
  loggedIn = true
): WorkspaceHandlerDeps {
  const session = new SessionService()
  if (loggedIn) session.setCurrentUser('real-user')
  return {
    workspaceService: {
      list: vi.fn().mockReturnValue([]),
      createWorkspace: vi.fn().mockReturnValue(fakeWorkspace),
      selectExternalDir: vi.fn().mockResolvedValue(null),
      ensureDefaultWorkspace: vi.fn().mockReturnValue(fakeDefault),
      openWorkspace: vi.fn().mockResolvedValue(undefined),
      deleteWorkspace: vi.fn().mockReturnValue(undefined),
      assertDeletable: vi.fn().mockReturnValue(undefined),
      listFiles: vi.fn().mockReturnValue([]),
      readFile: vi.fn().mockReturnValue({ content: '', truncated: false })
    } as never,
    conversationStore: {
      deleteConversationsByWorkspace: vi.fn().mockResolvedValue(0)
    } as never,
    session,
    ...overrides
  } as WorkspaceHandlerDeps
}

describe('workspace IPC handlers', () => {
  it('注册 workspace:list/create/select-dir/default/open/delete/list-files/read-file 通道', () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, createDeps())
    for (const channel of [
      'workspace:list',
      'workspace:create',
      'workspace:select-dir',
      'workspace:default',
      'workspace:open',
      'workspace:delete',
      'workspace:list-files',
      'workspace:read-file'
    ]) {
      expect(ipc.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  it('list 按当前登录用户查询', async () => {
    const ipc = createFakeIpcMain()
    const list = vi.fn().mockReturnValue([fakeWorkspace, fakeDefault])
    registerWorkspaceHandlers(ipc as never, createDeps({ workspaceService: { list } }))
    const result = await ipc.invoke<{ success: boolean; data?: unknown[] }>('workspace:list')
    expect(list).toHaveBeenCalledWith('real-user')
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
  })

  it('create 无参返回错误', async () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, createDeps())
    const result = await ipc.invoke<{ success: boolean; error?: string }>('workspace:create')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('create 合法名调用服务（注入 userId）并返回创建结果', async () => {
    const ipc = createFakeIpcMain()
    const createWorkspace = vi.fn().mockReturnValue(fakeWorkspace)
    registerWorkspaceHandlers(ipc as never, createDeps({ workspaceService: { createWorkspace } }))
    const result = await ipc.invoke<{ success: boolean; data?: unknown }>('workspace:create', '项目A')
    expect(createWorkspace).toHaveBeenCalledWith('项目A', 'real-user')
    expect(result.success).toBe(true)
    expect(result.data).toEqual(fakeWorkspace)
  })

  it('create 业务错误（非法名）透传 fail', async () => {
    const ipc = createFakeIpcMain()
    const createWorkspace = vi.fn().mockImplementation(() => {
      throw new Error('名称不能包含 / \\ : * ? " < > | 字符')
    })
    registerWorkspaceHandlers(ipc as never, createDeps({ workspaceService: { createWorkspace } }))
    const result = await ipc.invoke<{ success: boolean; error?: string }>('workspace:create', 'a/b')
    expect(result.success).toBe(false)
    expect(result.error).toContain('不能包含')
  })

  it('select-dir 取消时返回 null（success: true）', async () => {
    const ipc = createFakeIpcMain()
    const selectExternalDir = vi.fn().mockResolvedValue(null)
    registerWorkspaceHandlers(ipc as never, createDeps({ workspaceService: { selectExternalDir } }))
    const result = await ipc.invoke<{ success: boolean; data?: unknown }>('workspace:select-dir')
    expect(selectExternalDir).toHaveBeenCalledWith('real-user')
    expect(result.success).toBe(true)
    expect(result.data).toBeNull()
  })

  it('default 返回默认工作空间记录', async () => {
    const ipc = createFakeIpcMain()
    const ensureDefaultWorkspace = vi.fn().mockReturnValue(fakeDefault)
    registerWorkspaceHandlers(
      ipc as never,
      createDeps({ workspaceService: { ensureDefaultWorkspace } })
    )
    const result = await ipc.invoke<{ success: boolean; data?: { source: string } }>(
      'workspace:default'
    )
    expect(ensureDefaultWorkspace).toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.data!.source).toBe('default')
  })

  it('open 无参返回错误', async () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, createDeps())
    const result = await ipc.invoke<{ success: boolean; error?: string }>('workspace:open')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('open 合法 id 调用服务（注入 userId）', async () => {
    const ipc = createFakeIpcMain()
    const openWorkspace = vi.fn().mockResolvedValue(undefined)
    registerWorkspaceHandlers(ipc as never, createDeps({ workspaceService: { openWorkspace } }))
    const result = await ipc.invoke<{ success: boolean }>('workspace:open', 'ws-1')
    expect(openWorkspace).toHaveBeenCalledWith('ws-1', 'real-user')
    expect(result.success).toBe(true)
  })

  it('注册 workspace:delete 通道：先级联删除会话再删空间记录', async () => {
    const ipc = createFakeIpcMain()
    const deleteConversations = vi.fn().mockResolvedValue(2)
    const deleteWorkspace = vi.fn().mockReturnValue(undefined)
    const assertDeletable = vi.fn().mockReturnValue(undefined)
    registerWorkspaceHandlers(
      ipc as never,
      createDeps({
        workspaceService: { assertDeletable, deleteWorkspace },
        conversationStore: { deleteConversationsByWorkspace: deleteConversations }
      })
    )
    expect(ipc.handle).toHaveBeenCalledWith('workspace:delete', expect.any(Function))
    const noId = await ipc.invoke<{ success: boolean; error?: string }>('workspace:delete')
    expect(noId.success).toBe(false)
    const ok = await ipc.invoke<{ success: boolean }>('workspace:delete', 'ws-1')
    // 先会话后记录，均注入 userId
    expect(deleteConversations).toHaveBeenCalledWith('real-user', 'ws-1')
    expect(deleteWorkspace).toHaveBeenCalledWith('ws-1', 'real-user')
    expect(
      deleteConversations.mock.invocationCallOrder[0] < deleteWorkspace.mock.invocationCallOrder[0]
    ).toBe(true)
    expect(ok.success).toBe(true)
  })

  it('delete 级联删会话抛错 → 返回 fail 且不再删空间记录', async () => {
    const ipc = createFakeIpcMain()
    const deleteConversations = vi.fn().mockRejectedValue(new Error('checkpoint 删除失败'))
    const deleteWorkspace = vi.fn().mockReturnValue(undefined)
    const assertDeletable = vi.fn().mockReturnValue(undefined)
    registerWorkspaceHandlers(
      ipc as never,
      createDeps({
        workspaceService: { assertDeletable, deleteWorkspace },
        conversationStore: { deleteConversationsByWorkspace: deleteConversations }
      })
    )
    const result = await ipc.invoke<{ success: boolean; error?: string }>('workspace:delete', 'ws-1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('checkpoint')
    expect(deleteWorkspace).not.toHaveBeenCalled()
  })

  it('delete 默认空间（assertDeletable 抛错）→ 返回 fail 且不级联删会话', async () => {
    const ipc = createFakeIpcMain()
    const deleteConversations = vi.fn().mockResolvedValue(0)
    const deleteWorkspace = vi.fn().mockReturnValue(undefined)
    const assertDeletable = vi.fn().mockImplementation(() => {
      throw new Error('默认工作空间不可删除')
    })
    registerWorkspaceHandlers(
      ipc as never,
      createDeps({
        workspaceService: { assertDeletable, deleteWorkspace },
        conversationStore: { deleteConversationsByWorkspace: deleteConversations }
      })
    )
    const result = await ipc.invoke<{ success: boolean; error?: string }>(
      'workspace:delete',
      'ws-default'
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('默认')
    expect(deleteConversations).not.toHaveBeenCalled()
    expect(deleteWorkspace).not.toHaveBeenCalled()
  })

  it('注册 workspace:list-files/read-file 通道', async () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, createDeps())
    for (const channel of ['workspace:list-files', 'workspace:read-file']) {
      expect(ipc.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  it('list-files 无 id 返回错误', async () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, createDeps())
    const result = await ipc.invoke<{ success: boolean; error?: string }>('workspace:list-files')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('list-files 合法参数透传（注入 userId）并返回列表', async () => {
    const ipc = createFakeIpcMain()
    const listFiles = vi.fn().mockReturnValue([{ name: 'a.txt', type: 'file', relPath: 'a.txt' }])
    registerWorkspaceHandlers(ipc as never, createDeps({ workspaceService: { listFiles } }))
    const result = await ipc.invoke<{ success: boolean; data?: unknown[] }>(
      'workspace:list-files',
      'ws-1',
      'src'
    )
    expect(listFiles).toHaveBeenCalledWith('ws-1', 'real-user', 'src')
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  it('list-files relPath 缺省传空串', async () => {
    const ipc = createFakeIpcMain()
    const listFiles = vi.fn().mockReturnValue([])
    registerWorkspaceHandlers(ipc as never, createDeps({ workspaceService: { listFiles } }))
    await ipc.invoke('workspace:list-files', 'ws-1')
    expect(listFiles).toHaveBeenCalledWith('ws-1', 'real-user', '')
  })

  it('read-file 缺参数返回错误', async () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, createDeps())
    const noId = await ipc.invoke<{ success: boolean; error?: string }>('workspace:read-file', undefined, 'a.txt')
    expect(noId.success).toBe(false)
    const noPath = await ipc.invoke<{ success: boolean; error?: string }>('workspace:read-file', 'ws-1')
    expect(noPath.success).toBe(false)
  })

  it('read-file 合法参数透传（注入 userId）并返回内容', async () => {
    const ipc = createFakeIpcMain()
    const readFile = vi.fn().mockReturnValue({ content: 'hello', truncated: false })
    registerWorkspaceHandlers(ipc as never, createDeps({ workspaceService: { readFile } }))
    const result = await ipc.invoke<{ success: boolean; data?: { content: string } }>(
      'workspace:read-file',
      'ws-1',
      'a.txt'
    )
    expect(readFile).toHaveBeenCalledWith('ws-1', 'real-user', 'a.txt')
    expect(result.success).toBe(true)
    expect(result.data!.content).toBe('hello')
  })

  it('业务错误（越界）透传 fail', async () => {
    const ipc = createFakeIpcMain()
    const listFiles = vi.fn().mockImplementation(() => {
      throw new Error('路径越界')
    })
    registerWorkspaceHandlers(ipc as never, createDeps({ workspaceService: { listFiles } }))
    const result = await ipc.invoke<{ success: boolean; error?: string }>(
      'workspace:list-files',
      'ws-1',
      '../'
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('越界')
  })

  it('未登录时所有通道返回 fail（含"未登录"）', async () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, createDeps({}, false))
    for (const [channel, args] of [
      ['workspace:list', []],
      ['workspace:create', ['项目A']],
      ['workspace:select-dir', []],
      ['workspace:default', []],
      ['workspace:open', ['ws-1']],
      ['workspace:delete', ['ws-1']],
      ['workspace:list-files', ['ws-1', '']],
      ['workspace:read-file', ['ws-1', 'a.txt']]
    ] as const) {
      const result = await ipc.invoke<{ success: boolean; error?: string }>(channel, ...args)
      expect(result.success, channel).toBe(false)
      expect(result.error, channel).toContain('未登录')
    }
  })
})
