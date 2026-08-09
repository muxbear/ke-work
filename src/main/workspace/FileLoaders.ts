import { closeSync, openSync, readFileSync, readSync, statSync } from 'fs'
import { createRequire } from 'module'
import { TextDecoder } from 'util'
import { unzipSync } from 'fflate'
import { extractRawText } from 'mammoth'
import * as XLSX from 'xlsx'

// pdf-parse@1.1.1 的 index.js 含调试代码：若 module.parent 为空（vitest/vite-node 加载场景）会在 import 时读 test 目录文件报错。
// 用 createRequire 走 Node 原生 require，module.parent 恒有值从而跳过调试分支；生产 CJS 构建下 electron-vite 会转换 import.meta.url。
const pdfParse = createRequire(import.meta.url)('pdf-parse') as typeof import('pdf-parse')

export interface LoadedText {
  content: string
  truncated: boolean
}

/** 二进制文档原始文件上限（超过直接提示，不解析） */
export const MAX_BINARY_BYTES = 20 * 1024 * 1024
/** 提取/读取文本上限（与现有预览 200KB 一致，单位为字符） */
export const MAX_TEXT_CHARS = 200 * 1024

const BINARY_SNIFF_BYTES = 4 * 1024

/** pptx slide XML：段落与文本 run */
const A_P_REGEX = /<a:p[\s\S]*?<\/a:p>/g
const A_T_REGEX = /<a:t[^>]*>[\s\S]*?<\/a:t>/g

/**
 * 最小 XML 实体反转义（OOXML 文本中的 &amp; 等）。
 * 仅处理常用命名实体，预览用最小集，其余实体保持原样。
 */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** 提取文本超过上限时截断 */
function truncateText(text: string): LoadedText {
  if (text.length <= MAX_TEXT_CHARS) return { content: text, truncated: false }
  return { content: text.slice(0, MAX_TEXT_CHARS), truncated: true }
}

/** 二进制文档原始文件不得超过 20MB */
function assertNotTooBig(filePath: string): void {
  if (statSync(filePath).size > MAX_BINARY_BYTES) throw new Error('文件过大，暂不支持预览')
}

/** 二进制文档原始字节（含 20MB 上限） */
function readBytes(filePath: string): Buffer {
  assertNotTooBig(filePath)
  return readFileSync(filePath)
}

async function loadDocx(filePath: string): Promise<LoadedText> {
  assertNotTooBig(filePath)
  const { value } = await extractRawText({ path: filePath })
  return truncateText(value)
}

async function loadXlsx(filePath: string): Promise<LoadedText> {
  assertNotTooBig(filePath)
  const workbook = XLSX.readFile(filePath)
  const parts = workbook.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name])
    return `=== Sheet: ${name} ===\n${csv}`
  })
  return truncateText(parts.join('\n\n'))
}

async function loadPptx(filePath: string): Promise<LoadedText> {
  const files = unzipSync(new Uint8Array(readBytes(filePath)))
  const slideNames = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? 0)
      const nb = Number(b.match(/\d+/)?.[0] ?? 0)
      return na - nb
    })
  if (slideNames.length === 0) throw new Error('未找到幻灯片内容')
  const slides = slideNames.map((name) => {
    const xml = new TextDecoder().decode(files[name])
    const paragraphs = xml.match(A_P_REGEX) ?? []
    return paragraphs
      .map((p) => {
        const runs = p.match(A_T_REGEX) ?? []
        return runs.map((r) => unescapeXml(r.replace(/<\/?a:t[^>]*>/g, ''))).join('')
      })
      .join('\n')
  })
  return truncateText(slides.join('\n\n'))
}

async function loadPdf(filePath: string): Promise<LoadedText> {
  // pdf.js 1.10.100 的 makeSubStream 直接用 this.bytes.buffer 取原始 ArrayBuffer，
  // Node 的小 Buffer 来自共享字节池（byteOffset 非 0）会丢失偏移读到池内垃圾数据（>4KB 才用独立 ArrayBuffer）。
  // 转成普通 Uint8Array（独立 ArrayBuffer、byteOffset=0）规避该问题；pdf-parse 类型声明只收 Buffer，故断言。
  const u8 = new Uint8Array(readBytes(filePath))
  const data = await pdfParse(u8 as unknown as Buffer)
  return truncateText(data.text)
}

/**
 * 按扩展名选择文本加载器并提取文本（ext 为小写、无点）。
 * - docx/xlsx/pptx/pdf 走专用加载器（≤20MB，提取后 200KB 截断）
 * - ppt 旧二进制格式不支持
 * - 其余视为文本：读 ≤200KB、前 4KB NUL 嗅探拒绝二进制、UTF-8 解码
 */
export async function loadFileText(filePath: string, ext: string): Promise<LoadedText> {
  switch (ext) {
    case 'docx':
      return loadDocx(filePath)
    case 'xlsx':
      return loadXlsx(filePath)
    case 'pptx':
      return loadPptx(filePath)
    case 'pdf':
      return loadPdf(filePath)
    case 'ppt':
      throw new Error('该格式暂不支持预览')
    default: {
      // 与旧 readFile 行为一致：字节级 200KB 截断 + NUL 嗅探
      const size = statSync(filePath).size
      const truncated = size > 200 * 1024
      const buf = Buffer.alloc(Math.min(size, 200 * 1024))
      const fd = openSync(filePath, 'r')
      try {
        readSync(fd, buf, 0, buf.length, 0)
      } finally {
        closeSync(fd)
      }
      if (buf.subarray(0, BINARY_SNIFF_BYTES).includes(0)) throw new Error('二进制文件暂不支持预览')
      return { content: new TextDecoder('utf-8').decode(buf), truncated }
    }
  }
}
