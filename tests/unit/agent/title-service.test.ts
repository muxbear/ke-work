import { describe, expect, it } from 'vitest'
import { cleanTitle, TITLE_MAX_LEN } from '../../../src/main/agent/title-service'

describe('cleanTitle（LLM 输出清洗）', () => {
  it('严格截断到 TITLE_MAX_LEN（20）字符', () => {
    expect(cleanTitle('a'.repeat(50))).toHaveLength(TITLE_MAX_LEN)
    expect(cleanTitle('短的标题')).toBe('短的标题')
  })

  it('去除首尾引号/括号包裹', () => {
    expect(cleanTitle('"标题内容"')).toBe('标题内容')
    expect(cleanTitle('「总结标题」')).toBe('总结标题')
    expect(cleanTitle('【项目讨论】')).toBe('项目讨论')
  })

  it('折叠换行与多余空白', () => {
    expect(cleanTitle('多行\n标题')).toBe('多行 标题')
    expect(cleanTitle('  a   b  ')).toBe('a b')
  })

  it('空/纯空白输入返回空字符串', () => {
    expect(cleanTitle('')).toBe('')
    expect(cleanTitle('   ')).toBe('')
  })
})
