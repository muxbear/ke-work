import type { ConversationService } from '../services/ConversationService'
import type { SessionService } from '../services/SessionService'
import type { IpcMain } from 'electron'

interface ConversationHandlerDeps {
  conversationService: ConversationService
  session: SessionService
}

function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}

/** 注册会话相关 IPC 通道 */
export function registerConversationHandlers(ipc: IpcMain, deps: ConversationHandlerDeps): void {
  const { conversationService } = deps

  ipc.handle('conversation:list', async () => {
    try {
      return ok(await conversationService.findAll())
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('conversation:create', async (_event, _userId?: unknown, title?: unknown) => {
    if (typeof title !== 'string') {
      return fail('参数错误')
    }
    try {
      // userId 由主进程会话注入，不信任渲染层传参（防止外键/越权）
      const userId = deps.session.requireUserId()
      return ok(await conversationService.create({ userId, title }))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('conversation:get', async (_event, id?: unknown) => {
    if (typeof id !== 'string') return fail('参数错误')
    try {
      return ok(await conversationService.findById(id))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('conversation:update', async (_event, id?: unknown, title?: unknown) => {
    if (typeof id !== 'string' || typeof title !== 'string') return fail('参数错误')
    try {
      return ok(await conversationService.updateTitle(id, title))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('conversation:delete', async (_event, id?: unknown) => {
    if (typeof id !== 'string') return fail('参数错误')
    try {
      await conversationService.delete(id)
      return ok(null)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle(
    'conversation:add-message',
    async (
      _event,
      id?: unknown,
      msg?: { role?: unknown; content?: unknown; reasoning?: unknown; metadata?: unknown }
    ) => {
      if (typeof id !== 'string' || !msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') {
        return fail('参数错误')
      }
      try {
        return ok(
          await conversationService.addMessage(id, {
            role: msg.role as 'user' | 'assistant' | 'tool' | 'system',
            content: msg.content,
            reasoning: typeof msg.reasoning === 'string' ? msg.reasoning : undefined,
            metadata: typeof msg.metadata === 'string' ? msg.metadata : undefined
          })
        )
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )
}
