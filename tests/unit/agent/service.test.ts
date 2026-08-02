import { describe, expect, it } from 'vitest'
import { RemoveMessage, HumanMessage } from '@langchain/core/messages'
import { buildRegenerateInput } from '../../../src/main/agent/service'
import type { ConversationMessage } from '../../../src/main/agent/ConversationStore'

function msg(id: string, role: ConversationMessage['role']): ConversationMessage {
  return { id, role, content: `content-${id}` }
}

describe('buildRegenerateInput（重新生成的图输入构造）', () => {
  it('删除最后一条 user 之后的所有消息（RemoveMessage 命令）', () => {
    const history = [
      msg('u1', 'user'),
      msg('a1', 'assistant'),
      msg('u2', 'user'),
      msg('a2', 'assistant')
    ]
    const input = buildRegenerateInput(history)
    expect(input).toHaveLength(1)
    const rm = input[0]
    expect(rm).toBeInstanceOf(RemoveMessage)
    expect(rm.id).toBe('a2')
  })

  it('尾部含 tool 消息时全部删除（AI 工具调用链整体重生成）', () => {
    const history = [
      msg('u1', 'user'),
      msg('a1', 'assistant'),
      msg('t1', 'tool'),
      msg('a2', 'assistant'),
      msg('t2', 'tool')
    ]
    const input = buildRegenerateInput(history)
    expect(input.map((m) => m.id)).toEqual(['a1', 't1', 'a2', 't2'])
    expect(input.every((m) => m instanceof RemoveMessage)).toBe(true)
  })

  it('尾部为空（上次发送失败停在 user）时返回最后 user 消息（同 id 去重 no-op 保证图执行）', () => {
    const history = [msg('u1', 'user'), msg('a1', 'assistant'), msg('u2', 'user')]
    const input = buildRegenerateInput(history)
    expect(input).toHaveLength(1)
    expect(input[0]).toBeInstanceOf(HumanMessage)
    expect(input[0].id).toBe('u2')
  })

  it('无 user 消息的历史返回空列表', () => {
    const history = [msg('s1', 'system')]
    expect(buildRegenerateInput(history)).toEqual([])
    expect(buildRegenerateInput([])).toEqual([])
  })
})
