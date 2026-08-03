import { ChatDeepSeek } from '@langchain/deepseek'

/** 标题长度上限（严格限制，超出截断） */
export const TITLE_MAX_LEN = 20
/** 标题总结输入的对话消息条数上限（控制 token 消耗） */
const MAX_MESSAGES_FOR_TITLE = 8
/** 单条消息参与总结的最大字符数 */
const MAX_MESSAGE_CHARS = 200

/**
 * 清洗 LLM 输出为标题：去首尾引号/括号、折叠空白、严格截断到上限
 */
export function cleanTitle(raw: string): string {
  let t = raw.trim()
  // 去除常见引号/括号包裹
  t = t.replace(/^["'「『【（]+|["'」』】）]+$/g, '').trim()
  // 折叠换行/多余空白
  t = t.replace(/\s+/g, ' ').trim()
  if (t.length > TITLE_MAX_LEN) t = t.slice(0, TITLE_MAX_LEN)
  return t
}

/**
 * 调用 LLM 生成对话总结标题（严格 ≤ TITLE_MAX_LEN 字符）
 * @throws 调用失败或输出为空时抛错（调用方兜底为首条消息截断）
 */
export async function summarizeTitle(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  // 用对话模型（deepseek-chat）而非推理模型：推理模型的 max_tokens 会被 reasoning_content 耗尽导致 content 为空
  const llm = new ChatDeepSeek({
    model: 'deepseek-chat',
    temperature: 0,
    maxTokens: 64
  })
  const transcript = messages
    .slice(0, MAX_MESSAGES_FOR_TITLE)
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content.slice(0, MAX_MESSAGE_CHARS)}`)
    .join('\n')
  if (!transcript.trim()) throw new Error('empty transcript')

  const res = await llm.invoke(
    `请根据以下对话内容总结一个标题。要求：直接输出标题本身，不要引号、不要标点、不要解释，字数严格不超过 ${TITLE_MAX_LEN} 个字。\n\n${transcript}`
  )
  const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
  const title = cleanTitle(content)
  if (!title) throw new Error('empty title')
  return title
}
