import type { ConversationStore } from '../agent/ConversationStore'
import type { SessionService } from '../services/SessionService'
import type { IpcMain } from 'electron'

interface ConversationHandlerDeps {
  conversationStore: ConversationStore
  session: SessionService
}

function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}

/**
 * 注册会话相关 IPC 通道
 * 会话数据基于 LangGraph checkpointer：列表/消息/删除均由主进程会话注入 userId，
 * thread_id 由 ConversationStore 按 userId 合成（不信任渲染层传参，防越权）
 */
export function registerConversationHandlers(ipc: IpcMain, deps: ConversationHandlerDeps): void {
  const { conversationStore, session } = deps

  ipc.handle('conversation:list', async () => {
    try {
      const userId = session.requireUserId()
      return ok(await conversationStore.listConversations(userId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('conversation:get', async (_event, id?: unknown) => {
    if (typeof id !== 'string' || !id) return fail('参数错误')
    try {
      const userId = session.requireUserId()
      const messages = await conversationStore.getMessages(userId, id)
      return ok({ id, messages })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('conversation:delete', async (_event, id?: unknown) => {
    if (typeof id !== 'string' || !id) return fail('参数错误')
    try {
      const userId = session.requireUserId()
      await conversationStore.deleteConversation(userId, id)
      return ok(null)
    } catch (err) {
      return fail((err as Error).message)
    }
  })
}
