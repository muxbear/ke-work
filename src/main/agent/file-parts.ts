import { readFile, stat } from 'fs/promises'
import { basename } from 'path'
import { loadFileText } from '../workspace/FileLoaders'
import type { MessagePart } from '../../preload/index.d'

/** 附件类型白名单（主进程权威；渲染层 UX 副本见 NewTaskPage） */
export const TEXT_EXTENSIONS = [
  'txt',
  'md',
  'csv',
  'json',
  'yaml',
  'yml',
  'xml',
  'html',
  'css',
  'js',
  'ts',
  'jsx',
  'tsx',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'go',
  'rs',
  'sh',
  'sql',
  'log',
  'ini',
  'toml'
] as const
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] as const

/** 单次最多附件数 */
export const MAX_ATTACH_FILES = 10
/** 文本文件原始字节上限（内容另有 50K 字符截断） */
export const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024
/** PDF 原始字节上限（对齐 FileLoaders.MAX_BINARY_BYTES 既有约定） */
export const MAX_PDF_BYTES = 20 * 1024 * 1024
/** 图片原始字节上限（DeepSeek 视觉接口 base64 惯例上限） */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
/** 附件文本送入模型的字符上限（控制上下文预算） */
export const MAX_ATTACH_TEXT_CHARS = 50 * 1024

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp'
}

export type FileKind = 'text' | 'image' | 'pdf' | 'unsupported'

/** 扩展名（小写、无点）分类 */
function getExt(path: string): string {
  return basename(path).split('.').pop()?.toLowerCase() ?? ''
}

/** 按扩展名分类文件类型 */
export function classifyPath(path: string): FileKind {
  const ext = getExt(path)
  if ((TEXT_EXTENSIONS as readonly string[]).includes(ext)) return 'text'
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  return 'unsupported'
}

/** 发送给模型的 LangChain 内容块（text / image_url） */
export type FileContentBlock =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

/**
 * agent:send 入参形状校验（主进程权威；非法输入抛错，由 handler catch 返回错误）
 * 限制：数组、text 为 string、file.path 为 string、文件数 ≤ MAX_ATTACH_FILES
 */
export function validateMessageParts(input: unknown): MessagePart[] {
  if (!Array.isArray(input)) throw new Error('参数错误')
  const out: MessagePart[] = []
  let fileCount = 0
  for (const item of input) {
    if (typeof item !== 'object' || item === null) throw new Error('参数错误')
    const p = item as Record<string, unknown>
    if (p.type === 'text') {
      if (typeof p.text !== 'string') throw new Error('参数错误')
      out.push({ type: 'text', text: p.text })
    } else if (p.type === 'file') {
      if (typeof p.path !== 'string' || !p.path) throw new Error('参数错误')
      fileCount++
      if (fileCount > MAX_ATTACH_FILES) throw new Error(`单次最多 ${MAX_ATTACH_FILES} 个文件`)
      out.push({ type: 'file', path: p.path })
    } else {
      throw new Error('参数错误')
    }
  }
  return out
}

/**
 * agent:send 入参归一（主进程权威）：字符串 → 单文本段；数组 → validateMessageParts；
 * 无有效内容（空数组 / 仅空文本段）抛「参数错误」。注意：仅含文件（无文本）是合法输入
 */
export function normalizeMessageInput(content: unknown): MessagePart[] {
  const parts =
    typeof content === 'string'
      ? [{ type: 'text' as const, text: content }]
      : validateMessageParts(content)
  if (parts.length === 0 || parts.every((p) => p.type === 'text' && !p.text.trim())) {
    throw new Error('参数错误')
  }
  return parts
}

/** 文本内容截断到上下文预算，截断时追加标注 */
function truncateForLLM(content: string, truncatedByLoader: boolean): string {
  const note = '\n…（内容过长，已截断）'
  if (content.length <= MAX_ATTACH_TEXT_CHARS) {
    return truncatedByLoader ? content + note : content
  }
  return content.slice(0, MAX_ATTACH_TEXT_CHARS) + note
}

/** 单个文件 → 内容块（校验 + 读取 + 转换） */
async function expandFilePart(path: string): Promise<FileContentBlock[]> {
  const name = basename(path)
  const kind = classifyPath(path)
  if (kind === 'unsupported') throw new Error(`暂不支持的文件类型：${name}`)
  const info = await stat(path).catch(() => null)
  if (!info || !info.isFile()) throw new Error(`文件不存在：${name}`)
  if (kind === 'text' && info.size > MAX_TEXT_FILE_BYTES) throw new Error(`文件过大：${name}`)
  if (kind === 'image' && info.size > MAX_IMAGE_BYTES) throw new Error(`文件过大：${name}`)
  if (kind === 'pdf' && info.size > MAX_PDF_BYTES) throw new Error(`文件过大：${name}`)

  if (kind === 'text') {
    const { content, truncated } = await loadFileText(path, getExt(path))
    // 标记格式与 ConversationStore.parseBlocks 的折叠正则耦合，改动需同步
    return [
      {
        type: 'text',
        text: `【文件：${name}】\n${truncateForLLM(content, truncated)}\n【文件内容结束】`
      }
    ]
  }
  if (kind === 'pdf') {
    const { content, truncated } = await loadFileText(path, 'pdf')
    return [
      {
        type: 'text',
        text: `【文件：${name}】\n${truncateForLLM(content, truncated)}\n【文件内容结束】`
      }
    ]
  }
  // 图片：标记文本块 + image_url 块（连续二元组，显示端折叠回文件名）
  // 标记格式与 ConversationStore.parseBlocks 的折叠正则耦合，改动需同步
  const mime = IMAGE_MIME[getExt(path)] ?? 'application/octet-stream'
  const data = await readFile(path)
  return [
    { type: 'text', text: `【文件：${name}】` },
    { type: 'image_url', image_url: { url: `data:${mime};base64,${data.toString('base64')}` } }
  ]
}

/** parts → 内容块（空文本块跳过；任一文件失败整体抛错） */
export async function expandFileParts(parts: MessagePart[]): Promise<FileContentBlock[]> {
  const blocks: FileContentBlock[] = []
  for (const part of parts) {
    if (part.type === 'text') {
      if (part.text) blocks.push({ type: 'text', text: part.text })
      continue
    }
    blocks.push(...(await expandFilePart(part.path)))
  }
  return blocks
}
