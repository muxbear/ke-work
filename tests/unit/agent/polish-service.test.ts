import { describe, expect, it } from 'vitest'
import { cleanPolished } from '../../../src/main/agent/polish-service'

describe('cleanPolished（LLM 输出清洗）', () => {
  it('去首尾空白，保留内部换行与段落', () => {
    expect(cleanPolished('  改写结果  ')).toBe('改写结果')
    expect(cleanPolished('第一行\n第二行')).toBe('第一行\n第二行')
  })

  it('空/纯空白输入返回空字符串', () => {
    expect(cleanPolished('')).toBe('')
    expect(cleanPolished('   \n  ')).toBe('')
  })
})
