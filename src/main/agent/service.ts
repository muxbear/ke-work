import type { BrowserWindow } from 'electron'
import type { BaseMessage } from '@langchain/core/messages'
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { DeepAgent } from 'deepagents'
import type { ConversationMessage } from './ConversationStore'

/** 图运行上下文（thread 与用户隔离） */
export interface AgentRunConfig {
  thread_id: string
  user_id: string
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
    { version: 'v3', signal, configurable: { thread_id: config.thread_id, user_id: config.user_id } }
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
