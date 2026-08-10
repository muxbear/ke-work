import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { registerFileHandlers } from '../../../src/main/ipc/file-handlers'

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

describe('file IPC handlers（选中文件即时校验）', () => {
  it('注册 file:inspect 通道', () => {
    const ipc = createFakeIpcMain()
    registerFileHandlers(ipc as never, { requireUserId: () => 'u1' })
    expect(ipc.handle).toHaveBeenCalledWith('file:inspect', expect.any(Function))
  })

  it('未登录拒绝（requireUserId 抛错返回 success:false）', async () => {
    const ipc = createFakeIpcMain()
    registerFileHandlers(ipc as never, {
      requireUserId: () => {
        throw new Error('未登录')
      }
    })
    const result = await ipc.invoke<{ success: boolean; error?: string }>(
      'file:inspect', 'C:\\a.txt'
    )
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('参数错误：path 非字符串', async () => {
    const ipc = createFakeIpcMain()
    registerFileHandlers(ipc as never, { requireUserId: () => 'u1' })
    const result = await ipc.invoke<{ success: boolean; error?: string }>('file:inspect', 42)
    expect(result.success).toBe(false)
    expect(result.error).toBe('参数错误')
  })

  it('存在文件返回 exists + kind（文本/图片/pdf/unsupported）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kw-fi-'))
    const txt = join(dir, 'a.md')
    writeFileSync(txt, 'hi')
    writeFileSync(join(dir, 'a.zip'), 'z')
    writeFileSync(join(dir, 'a.png'), 'p')
    writeFileSync(join(dir, 'a.pdf'), '%PDF')
    const ipc = createFakeIpcMain()
    registerFileHandlers(ipc as never, { requireUserId: () => 'u1' })
    const r1 = await ipc.invoke<{ success: boolean; data?: { exists: boolean; kind: string } }>(
      'file:inspect', txt
    )
    expect(r1.data).toMatchObject({ exists: true, kind: 'text' })
    const r2 = await ipc.invoke<{ success: boolean; data?: { kind: string } }>(
      'file:inspect', join(dir, 'a.zip')
    )
    expect(r2.data?.kind).toBe('unsupported')
    const r3 = await ipc.invoke<{ success: boolean; data?: { kind: string } }>(
      'file:inspect', join(dir, 'a.png')
    )
    expect(r3.data?.kind).toBe('image')
    const r4 = await ipc.invoke<{ success: boolean; data?: { kind: string } }>(
      'file:inspect', join(dir, 'a.pdf')
    )
    expect(r4.data?.kind).toBe('pdf')
  })

  it('不存在返回 kind=missing', async () => {
    const ipc = createFakeIpcMain()
    registerFileHandlers(ipc as never, { requireUserId: () => 'u1' })
    const result = await ipc.invoke<{ success: boolean; data?: { exists: boolean; kind: string } }>(
      'file:inspect', join(tmpdir(), 'nope.txt')
    )
    expect(result.data).toEqual({ exists: false, size: 0, kind: 'missing' })
  })
})
