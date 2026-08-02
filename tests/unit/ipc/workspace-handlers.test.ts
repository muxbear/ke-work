import { describe, expect, it, vi } from 'vitest'
import { registerWorkspaceHandlers } from '../../../src/main/ipc/workspace-handlers'

function createFakeIpcMain() {
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

const fakeWorkspace = { id: 'ws-1', name: '项目A', path: '/tmp/项目A', source: 'created', createdAt: 1 }

function deps(overrides: Record<string, unknown> = {}) {
  return {
    workspaceService: {
      list: vi.fn().mockReturnValue([]),
      createWorkspace: vi.fn().mockReturnValue(fakeWorkspace),
      selectExternalDir: vi.fn().mockResolvedValue(null),
      ensureTimestampWorkspace: vi.fn().mockReturnValue({
        ...fakeWorkspace,
        id: 'ws-ts',
        source: 'timestamp'
      }),
      openWorkspace: vi.fn().mockResolvedValue(undefined)
    },
    ...overrides
  } as never
}

describe('workspace IPC handlers', () => {
  it('注册 workspace:list/create/select-dir/timestamp/open 通道', () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, deps())
    for (const channel of [
      'workspace:list',
      'workspace:create',
      'workspace:select-dir',
      'workspace:timestamp',
      'workspace:open'
    ]) {
      expect(ipc.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  it('list 返回全部工作空间', async () => {
    const ipc = createFakeIpcMain()
    const list = vi.fn().mockReturnValue([fakeWorkspace])
    registerWorkspaceHandlers(ipc as never, deps({ workspaceService: { list } }))
    const result = await ipc.invoke<{ success: boolean; data?: unknown[] }>('workspace:list')
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  it('create 无参返回错误', async () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, deps())
    const result = await ipc.invoke<{ success: boolean; error?: string }>('workspace:create')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('create 合法名调用服务并返回创建结果', async () => {
    const ipc = createFakeIpcMain()
    const createWorkspace = vi.fn().mockReturnValue(fakeWorkspace)
    registerWorkspaceHandlers(ipc as never, deps({ workspaceService: { createWorkspace } }))
    const result = await ipc.invoke<{ success: boolean; data?: unknown }>('workspace:create', '项目A')
    expect(createWorkspace).toHaveBeenCalledWith('项目A')
    expect(result.success).toBe(true)
    expect(result.data).toEqual(fakeWorkspace)
  })

  it('create 业务错误（非法名）透传 fail', async () => {
    const ipc = createFakeIpcMain()
    const createWorkspace = vi.fn().mockImplementation(() => {
      throw new Error('名称不能包含 / \\ : * ? " < > | 字符')
    })
    registerWorkspaceHandlers(ipc as never, deps({ workspaceService: { createWorkspace } }))
    const result = await ipc.invoke<{ success: boolean; error?: string }>('workspace:create', 'a/b')
    expect(result.success).toBe(false)
    expect(result.error).toContain('不能包含')
  })

  it('select-dir 取消时返回 null（success: true）', async () => {
    const ipc = createFakeIpcMain()
    const selectExternalDir = vi.fn().mockResolvedValue(null)
    registerWorkspaceHandlers(ipc as never, deps({ workspaceService: { selectExternalDir } }))
    const result = await ipc.invoke<{ success: boolean; data?: unknown }>('workspace:select-dir')
    expect(result.success).toBe(true)
    expect(result.data).toBeNull()
  })

  it('timestamp 返回时间戳工作空间', async () => {
    const ipc = createFakeIpcMain()
    const ensureTimestampWorkspace = vi.fn().mockReturnValue({ ...fakeWorkspace, source: 'timestamp' })
    registerWorkspaceHandlers(
      ipc as never,
      deps({ workspaceService: { ensureTimestampWorkspace } })
    )
    const result = await ipc.invoke<{ success: boolean; data?: { source: string } }>(
      'workspace:timestamp'
    )
    expect(result.success).toBe(true)
    expect(result.data!.source).toBe('timestamp')
  })

  it('open 无参返回错误', async () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, deps())
    const result = await ipc.invoke<{ success: boolean; error?: string }>('workspace:open')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('open 合法 id 调用服务', async () => {
    const ipc = createFakeIpcMain()
    const openWorkspace = vi.fn().mockResolvedValue(undefined)
    registerWorkspaceHandlers(ipc as never, deps({ workspaceService: { openWorkspace } }))
    const result = await ipc.invoke<{ success: boolean }>('workspace:open', 'ws-1')
    expect(openWorkspace).toHaveBeenCalledWith('ws-1')
    expect(result.success).toBe(true)
  })

  it('注册 workspace:delete 通道并调用服务', async () => {
    const ipc = createFakeIpcMain()
    const deleteWorkspace = vi.fn().mockReturnValue(undefined)
    registerWorkspaceHandlers(ipc as never, deps({ workspaceService: { deleteWorkspace } }))
    expect(ipc.handle).toHaveBeenCalledWith('workspace:delete', expect.any(Function))
    const noId = await ipc.invoke<{ success: boolean; error?: string }>('workspace:delete')
    expect(noId.success).toBe(false)
    const ok = await ipc.invoke<{ success: boolean }>('workspace:delete', 'ws-1')
    expect(deleteWorkspace).toHaveBeenCalledWith('ws-1')
    expect(ok.success).toBe(true)
  })

  it('注册 workspace:list-files/read-file 通道', async () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, deps())
    for (const channel of ['workspace:list-files', 'workspace:read-file']) {
      expect(ipc.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  it('list-files 无 id 返回错误', async () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, deps())
    const result = await ipc.invoke<{ success: boolean; error?: string }>('workspace:list-files')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('list-files 合法参数透传并返回列表', async () => {
    const ipc = createFakeIpcMain()
    const listFiles = vi.fn().mockReturnValue([{ name: 'a.txt', type: 'file', relPath: 'a.txt' }])
    registerWorkspaceHandlers(ipc as never, deps({ workspaceService: { listFiles } }))
    const result = await ipc.invoke<{ success: boolean; data?: unknown[] }>(
      'workspace:list-files',
      'ws-1',
      'src'
    )
    expect(listFiles).toHaveBeenCalledWith('ws-1', 'src')
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  it('list-files relPath 缺省传空串', async () => {
    const ipc = createFakeIpcMain()
    const listFiles = vi.fn().mockReturnValue([])
    registerWorkspaceHandlers(ipc as never, deps({ workspaceService: { listFiles } }))
    await ipc.invoke('workspace:list-files', 'ws-1')
    expect(listFiles).toHaveBeenCalledWith('ws-1', '')
  })

  it('read-file 缺参数返回错误', async () => {
    const ipc = createFakeIpcMain()
    registerWorkspaceHandlers(ipc as never, deps())
    const noId = await ipc.invoke<{ success: boolean; error?: string }>('workspace:read-file', undefined, 'a.txt')
    expect(noId.success).toBe(false)
    const noPath = await ipc.invoke<{ success: boolean; error?: string }>('workspace:read-file', 'ws-1')
    expect(noPath.success).toBe(false)
  })

  it('read-file 合法参数透传并返回内容', async () => {
    const ipc = createFakeIpcMain()
    const readFile = vi.fn().mockReturnValue({ content: 'hello', truncated: false })
    registerWorkspaceHandlers(ipc as never, deps({ workspaceService: { readFile } }))
    const result = await ipc.invoke<{ success: boolean; data?: { content: string } }>(
      'workspace:read-file',
      'ws-1',
      'a.txt'
    )
    expect(readFile).toHaveBeenCalledWith('ws-1', 'a.txt')
    expect(result.success).toBe(true)
    expect(result.data!.content).toBe('hello')
  })

  it('业务错误（越界）透传 fail', async () => {
    const ipc = createFakeIpcMain()
    const listFiles = vi.fn().mockImplementation(() => {
      throw new Error('路径越界')
    })
    registerWorkspaceHandlers(ipc as never, deps({ workspaceService: { listFiles } }))
    const result = await ipc.invoke<{ success: boolean; error?: string }>(
      'workspace:list-files',
      'ws-1',
      '../'
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('越界')
  })
})
