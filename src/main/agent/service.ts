import type { BrowserWindow } from 'electron'
import type { BaseMessage } from '@langchain/core/messages'
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  RemoveMessage
} from '@langchain/core/messages'
import type { DeepAgent } from 'deepagents'
import type { ConversationMessage } from './ConversationStore'

/** 会话绑定的工作空间信息（写入 checkpoint metadata 持久化） */
export interface WorkspaceBinding {
  id: string
  name: string
  dir?: string
}

/** 图运行上下文（thread 与用户隔离；workspace_dir 供 backend 工厂按会话解析根目录） */
export interface AgentRunConfig {
  thread_id: string
  user_id: string
  /** 工作空间目录（进 configurable，LocalShellBackend 根目录） */
  workspace_dir?: string
  /** 工作空间绑定（进 metadata，checkpoint 持久化后用于会话分组） */
  workspace?: WorkspaceBinding | null
}

/** 会话消息转 LangChain 消息（带 DB/checkpoint id，addMessages reducer 按 id 去重防重复累积） */
export function toLangChainMessages(messages: ConversationMessage[]): BaseMessage[] {
  return messages.map((m) => {
    switch (m.role) {
      case 'user':
        return new HumanMessage({ id: m.id, content: m.content })
      case 'assistant':
        return new AIMessage({ id: m.id, content: m.content })
      case 'tool':
        return new ToolMessage({ id: m.id, content: m.content, tool_call_id: m.id })
      case 'system':
        return new SystemMessage({ id: m.id, content: m.content })
    }
  })
}

/**
 * 构造"重新生成"的图输入：把最后一条 user 消息之后的所有消息（旧 AI 回复 + 期间 tool 消息）
 * 转为 RemoveMessage 删除命令，messages 通道 reducer 删除旧回复后，图从 checkpoint 状态
 * 继续运行生成新回复（不新增 user 消息，无重复）。
 *
 * 边界：尾部无消息（上次发送失败、checkpoint 停在 user 消息）时返回最后一条 user 消息本身
 * （同 id 经 reducer 去重为 no-op，保证图执行）
 */
export function buildRegenerateInput(history: ConversationMessage[]): BaseMessage[] {
  const lastUserIdx = history.map((m) => m.role).lastIndexOf('user')
  // 无 user 消息（异常状态）不删除任何内容
  if (lastUserIdx === -1) return []
  const tail = history.slice(lastUserIdx + 1)
  const removes = tail
    .map((m) => new RemoveMessage({ id: m.id }))
    .filter((m) => m.id)
  if (removes.length === 0) {
    // 尾部无消息（上次发送失败、checkpoint 停在 user 消息）时返回最后一条 user 消息本身
    // （同 id 经 reducer 去重为 no-op，保证图执行）
    return toLangChainMessages([history[lastUserIdx]])
  }
  return removes
}

export async function invokeSendMessage(
  messages: BaseMessage[],
  win: BrowserWindow,
  agent: DeepAgent,
  config: AgentRunConfig,
  signal?: AbortSignal
): Promise<void> {
  console.log('[service] invokeSendMessage called, messages count:', messages.length)
  console.log('[service] signal aborted?:', signal?.aborted)

  const events = await agent.streamEvents(
    { messages },
    {
      version: 'v3',
      signal,
      configurable: {
        thread_id: config.thread_id,
        user_id: config.user_id,
        // workspace_dir 进入 configurable：backend 工厂运行时据此创建 LocalShellBackend
        ...(config.workspace_dir ? { workspace_dir: config.workspace_dir } : {})
      },
      // workspace 绑定写入 checkpoint metadata（langgraph 持久化，会话列表据此分组）
      ...(config.workspace ? { metadata: { workspace: config.workspace } } : {})
    }
  )
  console.log('[service] streamEvents returned, type:', typeof events, 'has messages:', 'messages' in events)

  let chunkCount = 0
  for await (const chunk of events.messages) {
    // 先处理 reasoning（深度思考）流
    let reasoningCount = 0
    for await (const token of chunk.reasoning) {
      reasoningCount++
      win.webContents.send('agent:stream-thinking', token)
    }
    if (reasoningCount > 0) {
      console.log('[service] reasoning done, tokens:', reasoningCount)
      win.webContents.send('agent:stream-thinking-done')
    }

    // 再处理 text（正式回复）流
    let textCount = 0
    for await (const text of chunk.text) {
      textCount++
      chunkCount++
      win.webContents.send('agent:stream-chunk', text)
    }
    console.log('[service] message chunk done, text pieces:', textCount, 'reasoning pieces:', reasoningCount)
  }

  console.log('[service] all messages done, total text chunks sent:', chunkCount)
  // 流结束信号
  win.webContents.send('agent:stream-done')
  console.log('[service] stream-done sent')
}
