import type { BrowserWindow } from 'electron'
import agent from './agent'

export async function invokeSendMessage(
  messages: Array<{ role: string; content: string }>,
  win: BrowserWindow,
  signal?: AbortSignal
): Promise<void> {
  console.log('[service] invokeSendMessage called, messages count:', messages.length)
  console.log('[service] signal aborted?:', signal?.aborted)

  const events = await agent.streamEvents(
    { messages },
    { version: 'v3', signal }
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
