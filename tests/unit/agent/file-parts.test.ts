import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// pdf-parse 走 FileLoaders：默认透传真实实现（文本用例真实读取），PDF 用例 mockResolvedValueOnce 覆盖
vi.mock('../../../src/main/workspace/FileLoaders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/main/workspace/FileLoaders')>()
  return { loadFileText: vi.fn(actual.loadFileText) }
})

import { loadFileText } from '../../../src/main/workspace/FileLoaders'
import {
  classifyPath,
  expandFileParts,
  validateMessageParts,
  MAX_ATTACH_FILES,
  MAX_ATTACH_TEXT_CHARS,
  MAX_TEXT_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES
} from '../../../src/main/agent/file-parts'
import type { MessagePart } from '../../../src/preload/index.d'

function tmpFile(name: string, content: Buffer | string): string {
  const dir = mkdtempSync(join(tmpdir(), 'kw-fp-'))
  const p = join(dir, name)
  writeFileSync(p, content)
  return p
}

describe('classifyPath（扩展名 → 类型）', () => {
  it('文本类 / 图片 / pdf / 未知类型', () => {
    expect(classifyPath('C:\\docs\\报告.md')).toBe('text')
    expect(classifyPath('/data/a.PNG')).toBe('image')
    expect(classifyPath('/data/a.pdf')).toBe('pdf')
    expect(classifyPath('/data/a.zip')).toBe('unsupported')
    expect(classifyPath('/data/noext')).toBe('unsupported')
  })
})

describe('validateMessageParts（形状校验）', () => {
  it('合法数组原样返回', () => {
    const parts: MessagePart[] = [
      { type: 'text', text: '请分析' },
      { type: 'file', path: 'C:\\a.txt' }
    ]
    expect(validateMessageParts(parts)).toEqual(parts)
  })

  it('非数组 / 未知 type / path 非字符串 → 抛错', () => {
    expect(() => validateMessageParts(null)).toThrow('参数错误')
    expect(() => validateMessageParts([{ type: 'x', text: 'a' }])).toThrow('参数错误')
    expect(() => validateMessageParts([{ type: 'file', path: 42 }])).toThrow('参数错误')
  })

  it(`文件数超过 ${MAX_ATTACH_FILES} 抛错`, () => {
    const many: MessagePart[] = Array.from({ length: MAX_ATTACH_FILES + 1 }, (_, i) => ({
      type: 'file' as const,
      path: `C:\\f${i}.txt`
    }))
    expect(() => validateMessageParts(many)).toThrow(`单次最多 ${MAX_ATTACH_FILES} 个文件`)
  })
})

describe('expandFileParts（文件 → 内容块，位置保序）', () => {
  it('文本文件 → 文本块（带文件标记头尾）', async () => {
    const p = tmpFile('报告.md', '今天完成了登录模块。')
    const blocks = await expandFileParts([{ type: 'file', path: p }])
    expect(blocks).toEqual([
      { type: 'text', text: '【文件：报告.md】\n今天完成了登录模块。\n【文件内容结束】' }
    ])
  })

  it('图片文件 → 标记块 + base64 image_url 块（二元组）', async () => {
    const p = tmpFile('图.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const blocks = await expandFileParts([{ type: 'file', path: p }])
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ type: 'text', text: '【文件：图.png】' })
    expect(blocks[1].type).toBe('image_url')
    expect((blocks[1] as { image_url: { url: string } }).image_url.url).toBe(
      'data:image/png;base64,iVBORw0KGgo='
    )
  })

  it('文本与图片混合时保持 parts 顺序', async () => {
    const t = tmpFile('a.txt', 'AAA')
    const img = tmpFile('b.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const blocks = await expandFileParts([
      { type: 'text', text: '先' },
      { type: 'file', path: t },
      { type: 'file', path: img },
      { type: 'text', text: '后' }
    ])
    expect(blocks.map((b) => b.type)).toEqual(['text', 'text', 'text', 'image_url', 'text'])
    expect(blocks[4]).toEqual({ type: 'text', text: '后' })
  })

  it('PDF → 经 FileLoaders 抽文本为文本块', async () => {
    const p = tmpFile('报告.pdf', 'not-a-real-pdf')
    vi.mocked(loadFileText).mockResolvedValueOnce({ content: 'PDF 抽取的正文', truncated: false })
    const blocks = await expandFileParts([{ type: 'file', path: p }])
    expect(blocks).toEqual([
      { type: 'text', text: '【文件：报告.pdf】\nPDF 抽取的正文\n【文件内容结束】' }
    ])
  })

  it('文件不存在 → 抛「文件不存在」', async () => {
    await expect(
      expandFileParts([{ type: 'file', path: join(tmpdir(), 'no-such-file-xyz.txt') }])
    ).rejects.toThrow('文件不存在')
  })

  it('不支持类型 → 抛「暂不支持的文件类型」', async () => {
    const p = tmpFile('a.zip', 'x')
    await expect(expandFileParts([{ type: 'file', path: p }])).rejects.toThrow('暂不支持的文件类型')
  })

  it('文本内容超过 50K 字符截断并标注', async () => {
    const big = 'x'.repeat(MAX_ATTACH_TEXT_CHARS + 100)
    const p = tmpFile('big.txt', big)
    const blocks = await expandFileParts([{ type: 'file', path: p }])
    const text = blocks[0] as { text: string }
    expect(text.text).toContain('…（内容过长，已截断）')
    expect(text.text.length).toBeLessThan(MAX_ATTACH_TEXT_CHARS + 100)
  })

  it('文本文件超过 5MB → 文件过大', async () => {
    const p = tmpFile('big.txt', Buffer.alloc(MAX_TEXT_FILE_BYTES + 1, 0x41))
    await expect(expandFileParts([{ type: 'file', path: p }])).rejects.toThrow('文件过大：big.txt')
  })

  it('图片文件超过 10MB → 文件过大', async () => {
    const p = tmpFile('big.png', Buffer.alloc(MAX_IMAGE_BYTES + 1, 0x41))
    await expect(expandFileParts([{ type: 'file', path: p }])).rejects.toThrow('文件过大：big.png')
  })

  it('PDF 文件超过 20MB → 文件过大', async () => {
    const p = tmpFile('big.pdf', Buffer.alloc(MAX_PDF_BYTES + 1, 0x41))
    await expect(expandFileParts([{ type: 'file', path: p }])).rejects.toThrow('文件过大：big.pdf')
  })

  it('混合 parts 中第二个文件缺失 → 整体失败，不返回部分块', async () => {
    const ok = tmpFile('ok.txt', 'AAA')
    await expect(
      expandFileParts([
        { type: 'text', text: '先' },
        { type: 'file', path: ok },
        { type: 'file', path: join(tmpdir(), 'no-such-file-xyz.txt') },
        { type: 'text', text: '后' }
      ])
    ).rejects.toThrow('文件不存在')
  })
})
