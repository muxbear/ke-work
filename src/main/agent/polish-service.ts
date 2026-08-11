import { ChatDeepSeek } from '@langchain/deepseek'

/** 改写输入文本长度上限（超出拒绝，控制 token 消耗） */
export const POLISH_MAX_TEXT_CHARS = 20_000

/** 清洗 LLM 输出：去首尾空白（保留内部换行与段落结构） */
export function cleanPolished(raw: string): string {
  return raw.trim()
}

/**
 * 调用 LLM 改写润色输入文本（表达更清晰、逻辑更有条理、更适合作为任务指令）
 * @throws 调用失败或输出为空时抛错（调用方展示错误）
 */
export async function polishText(text: string): Promise<string> {
  const llm = new ChatDeepSeek({
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2048
  })
  const res = await llm.invoke([
    {
      role: 'system',
      content:
        '你是文本改写润色助手。用户会发来一段想发给 AI 助手的消息，请将其改写润色：表达更清晰、逻辑更有条理、内容更完整，使其更适合作为任务指令。直接输出改写后的内容，不要解释、不要加前缀，不要使用引号包裹。'
    },
    { role: 'user', content: text }
  ])
  const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
  const polished = cleanPolished(content)
  if (!polished) throw new Error('改写结果为空')
  return polished
}
