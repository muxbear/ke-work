<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import QRCode from 'qrcode'
import { useAgentStore } from '@store/agent'
import { useWorkspaceStore } from '@store/workspace'
import { useModelStore } from '@store/models'
import MessageContent from '@components/MessageContent.vue'
import ChatSidePanel from '@components/ChatSidePanel.vue'
import PlusMenu from '@components/PlusMenu.vue'
import { useCatalogStore, type Mode, type SkillItem } from '@store/catalog'
import type { MessagePart } from '../../../preload/index.d'

const agentStore = useAgentStore()
const workspaceStore = useWorkspaceStore()
const catalog = useCatalogStore()
const modelStore = useModelStore()
const emit = defineEmits<{ navigate: [tab: '专家·技能·连接器'] }>()

// 通过本地 computed 包装 agentStore，建立正确的 Vue 响应式依赖链
const currentMessages = computed(() => agentStore.currentMessages)
const isStreaming = computed(() => agentStore.isStreaming)
const isThinking = computed(() => agentStore.isThinking)

// ── State ──
const category = ref('work')
const taskInput = ref('')
const model = ref('Auto')
const modelOpen = ref(false)
const showInputPlusMenu = ref(false)
const chipsScrollRef = ref<HTMLElement | null>(null)

// ── 技能 token（contenteditable 输入框）──
const welcomeInputRef = ref<HTMLElement | null>(null)
const chatInputRef = ref<HTMLElement | null>(null)
const pendingExpertPromptSync = ref(false)

/** 当前可见的输入框元素（欢迎态与对话态互斥挂载） */
const getInputEl = (): HTMLElement | null => welcomeInputRef.value ?? chatInputRef.value

/** 相邻文本段合并（减少 parts 数量；文件段自然分隔） */
const pushTextPart = (parts: MessagePart[], text: string): void => {
  const last = parts[parts.length - 1]
  if (last && last.type === 'text') last.text += text
  else parts.push({ type: 'text', text })
}

/** 序列化输入框 DOM → 保序消息部件：文本节点原样；技能 token → /技能名；文件 token → {type:'file',path} */
const serializeInput = (el: HTMLElement): MessagePart[] => {
  const parts: MessagePart[] = []
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? ''
      if (t) pushTextPart(parts, t)
    } else if (node instanceof HTMLElement && node.classList.contains('skill-token')) {
      pushTextPart(parts, '/' + (node.dataset.name ?? node.textContent ?? ''))
    } else if (node instanceof HTMLElement && node.classList.contains('file-token')) {
      const path = node.dataset.path
      if (path) parts.push({ type: 'file', path })
    } else if (node.nodeName === 'BR') {
      pushTextPart(parts, '\n')
    } else if (node instanceof HTMLElement) {
      const t = node.textContent ?? ''
      if (t) pushTextPart(parts, t)
    }
  }
  return parts
}

/** 在光标处插入技能 token（无有效光标时追加到末尾），光标移到 token 后 */
const insertSkillTokenAtCaret = (el: HTMLElement, skill: SkillItem): void => {
  const sel = window.getSelection()
  let range: Range
  if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
    range = sel.getRangeAt(0)
    range.collapse(false)
  } else {
    range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
  }
  const token = document.createElement('span')
  token.className = 'skill-token'
  token.dataset.skillId = String(skill.id)
  token.dataset.name = skill.name
  token.contentEditable = 'false'
  const icon = document.createElement('span')
  icon.className = 'skill-token-icon'
  icon.style.background = skill.color
  const flash = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  flash.setAttribute('width', '9')
  flash.setAttribute('height', '9')
  flash.setAttribute('viewBox', '0 0 24 24')
  flash.setAttribute('fill', 'none')
  flash.setAttribute('stroke', 'white')
  flash.setAttribute('stroke-width', '3')
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
  poly.setAttribute('points', '13 2 3 14 12 14 11 22 21 10 12 10 13 2')
  flash.appendChild(poly)
  const del = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  del.classList.add('skill-token-del')
  del.setAttribute('width', '10')
  del.setAttribute('height', '10')
  del.setAttribute('viewBox', '0 0 24 24')
  del.setAttribute('fill', 'none')
  del.setAttribute('stroke', 'white')
  del.setAttribute('stroke-width', '2.5')
  del.setAttribute('stroke-linecap', 'round')
  const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  l1.setAttribute('x1', '18')
  l1.setAttribute('y1', '6')
  l1.setAttribute('x2', '6')
  l1.setAttribute('y2', '18')
  const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  l2.setAttribute('x1', '6')
  l2.setAttribute('y1', '6')
  l2.setAttribute('x2', '18')
  l2.setAttribute('y2', '18')
  del.appendChild(l1)
  del.appendChild(l2)
  icon.appendChild(flash)
  icon.appendChild(del)
  const name = document.createElement('span')
  name.className = 'skill-token-name'
  name.textContent = skill.name
  token.appendChild(icon)
  token.appendChild(name)
  range.insertNode(token)
  range.setStartAfter(token)
  range.collapse(true)
  sel?.removeAllRanges()
  sel?.addRange(range)
  taskInput.value = el.innerText
}

/** 在光标处插入文件 token（图标 + 文件名；title 原生提示绝对路径），光标移到 token 后 */
const insertFileTokenAtCaret = (el: HTMLElement, filePath: string): void => {
  const sel = window.getSelection()
  let range: Range
  if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
    range = sel.getRangeAt(0)
    range.collapse(false)
  } else {
    range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
  }
  const token = document.createElement('span')
  token.className = 'file-token'
  token.dataset.path = filePath
  token.title = filePath // 悬停显示绝对路径（原生 tooltip）
  token.contentEditable = 'false'
  const icon = document.createElement('span')
  icon.className = 'file-token-icon'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '10')
  svg.setAttribute('height', '10')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z')
  svg.appendChild(path)
  const del = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  del.classList.add('file-token-del')
  del.setAttribute('width', '10')
  del.setAttribute('height', '10')
  del.setAttribute('viewBox', '0 0 24 24')
  del.setAttribute('fill', 'none')
  del.setAttribute('stroke', 'currentColor')
  del.setAttribute('stroke-width', '2.5')
  del.setAttribute('stroke-linecap', 'round')
  const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  l1.setAttribute('x1', '18')
  l1.setAttribute('y1', '6')
  l1.setAttribute('x2', '6')
  l1.setAttribute('y2', '18')
  const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  l2.setAttribute('x1', '6')
  l2.setAttribute('y1', '6')
  l2.setAttribute('x2', '18')
  l2.setAttribute('y2', '18')
  del.appendChild(l1)
  del.appendChild(l2)
  icon.appendChild(svg)
  icon.appendChild(del)
  const name = document.createElement('span')
  name.className = 'file-token-name'
  name.textContent = filePath.split(/[\\/]/).pop() || filePath
  token.appendChild(icon)
  token.appendChild(name)
  range.insertNode(token)
  range.setStartAfter(token)
  range.collapse(true)
  sel?.removeAllRanges()
  sel?.addRange(range)
  taskInput.value = el.innerText
}

/** 从 DOM 移除第一个指定技能的 token */
const removeSkillTokenFromDom = (el: HTMLElement, id: number): void => {
  for (const node of Array.from(el.children)) {
    if (node instanceof HTMLElement && node.classList.contains('skill-token')) {
      if (Number(node.dataset.skillId) === id) {
        node.remove()
        break
      }
    }
  }
  taskInput.value = el.innerText
}

/** 菜单选技能：切 store 勾选（真相源）+ 同步 DOM（插入或移除 token） */
const onSelectSkillToken = (id: number): void => {
  const skill = catalog.skillItems.find((s) => s.id === id)
  const el = getInputEl()
  if (!skill || !el) return
  const willSelect = !catalog.selectedSkillIds.includes(id)
  catalog.toggleSkill(id)
  if (willSelect) insertSkillTokenAtCaret(el, skill)
  else removeSkillTokenFromDom(el, id)
}

/** PlusMenu 选中本地文件 → 逐个即时校验（UX 前置），通过的在光标处插入文件 token */
const onSelectFiles = async (paths: string[]): Promise<void> => {
  const el = getInputEl()
  if (!el) return
  // 去重：同一文件多次选择只插一个 token（恢复旧 chips 去重语义）
  const uniquePaths = [...new Set(paths)]
  if (uniquePaths.length > FILE_MAX_COUNT) {
    showToast(`单次最多选择 ${FILE_MAX_COUNT} 个文件`)
    return
  }
  const accepted: string[] = []
  for (const p of uniquePaths) {
    const name = p.split(/[\\/]/).pop() ?? p
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const isText = FILE_TEXT_EXTS.includes(ext)
    const isImage = FILE_IMAGE_EXTS.includes(ext)
    const isPdf = ext === 'pdf'
    if (!isText && !isImage && !isPdf) {
      showToast(`暂不支持该文件类型：${name}`)
      continue
    }
    const res = await window.api.inspectFile(p)
    if (!res.success) {
      showToast(res.error ?? '文件校验失败')
      continue
    }
    const data = res.data
    if (!data || !data.exists) {
      showToast(`文件不存在：${name}`)
      continue
    }
    if (data.kind === 'unsupported') {
      // 主进程权威分类兜底（防两份扩展名列表漂移）
      showToast(`暂不支持该文件类型：${name}`)
      continue
    }
    const limit = data.kind === 'text' ? FILE_MAX_TEXT_BYTES : data.kind === 'image' ? FILE_MAX_IMAGE_BYTES : FILE_MAX_PDF_BYTES
    if (data.size > limit) {
      showToast(`文件过大（上限 ${Math.round(limit / 1024 / 1024)}MB）：${name}`)
      continue
    }
    accepted.push(p)
  }
  // await 期间输入框可能已卸载（页面切换），守卫防插入到游离 DOM
  if (!el.isConnected) return
  for (const p of accepted) insertFileTokenAtCaret(el, p)
}

// ── 拖拽文件入输入框（效果与「+ → 添加文件 → 本地文件」一致） ──
const inputDragging = ref(false)
let fileDragDepth = 0

/** 仅响应文件拖拽（文本拖拽保留浏览器默认插入） */
const isFileDrag = (e: DragEvent): boolean => !!e.dataTransfer?.types.includes('Files')

/** 拖入输入框：高亮提示可放置（dragenter/dragleave 在子节点间冒泡，用深度计数防闪烁） */
const onInputDragEnter = (e: DragEvent): void => {
  e.preventDefault()
  if (!isFileDrag(e)) return
  fileDragDepth++
  inputDragging.value = true
}

/** 持续派发时阻止默认（否则 drop 不被允许） */
const onInputDragOver = (e: DragEvent): void => {
  e.preventDefault()
}

const onInputDragLeave = (e: DragEvent): void => {
  if (!isFileDrag(e)) return
  fileDragDepth = Math.max(0, fileDragDepth - 1)
  if (fileDragDepth === 0) inputDragging.value = false
}

/** 松手：光标定位到拖放点，解析真实路径后复用 onSelectFiles 的校验与插入管线 */
const onInputDrop = (e: DragEvent): void => {
  fileDragDepth = 0
  inputDragging.value = false
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (!files.length) return // 文本拖拽：不做拦截，保留浏览器默认插入
  e.preventDefault()
  const el = getInputEl()
  if (!el) return
  // 光标定位到拖放点（caretRangeFromPoint 为 Chromium 扩展 API，Electron 可用）
  const range = document.caretRangeFromPoint(e.clientX, e.clientY)
  if (range) {
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
  // Electron 39 起 File.path 已移除：经 preload 的 webUtils.getPathForFile 解析真实路径
  const paths = files.map((f) => window.api.getPathForFile(f)).filter((p): p is string => !!p)
  if (!paths.length) {
    showToast('无法读取文件，请从本地文件夹重新拖入')
    return
  }
  void onSelectFiles(paths)
}

// ── AI 改写润色：调用大模型改写输入框纯文本内容 ──
const polishing = ref(false)

/** 点击「AI 改写润色」：校验 → 主进程调 LLM → 改写结果替换输入内容（含 token 时拒绝） */
const onPolishClick = async (): Promise<void> => {
  if (polishing.value) return
  const el = getInputEl()
  if (!el) return
  const text = el.innerText.trim()
  if (!text) {
    showToast('请先输入要改写的内容')
    return
  }
  if (el.querySelector('.skill-token, .file-token')) {
    showToast('改写仅支持纯文本，请先移除文件或技能标记')
    return
  }
  polishing.value = true
  try {
    const res = await window.api.polishText(text)
    if (!res.success || res.data === undefined) {
      throw new Error(res.error || '改写失败')
    }
    // 改写结果替换输入内容（textContent 保留换行，white-space: pre-wrap 直接渲染）
    el.textContent = res.data
    taskInput.value = el.innerText
    // 光标移到末尾并保持焦点（改写后即可继续输入/发送）
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)
    el.focus()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '改写失败，请重试')
  } finally {
    polishing.value = false
  }
}

/** 点击输入框内 token → 删除（技能 token 同步取消勾选；hover 变 × 由 CSS 实现）；普通点击不拦截 */
const onInputClick = (e: MouseEvent): void => {
  const el = getInputEl()
  if (!el) return
  const token = (e.target as HTMLElement).closest<HTMLElement>('.skill-token, .file-token')
  if (!token) return
  e.preventDefault()
  const prevSibling = token.previousSibling
  if (token.classList.contains('skill-token')) {
    catalog.toggleSkill(Number(token.dataset.skillId)) // 移除勾选，菜单勾选态同步消失
  }
  token.remove()
  taskInput.value = el.innerText
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  if (prevSibling) {
    range.setStartAfter(prevSibling)
    range.collapse(true)
  } else {
    range.selectNodeContents(el)
    range.collapse(true)
  }
  sel.removeAllRanges()
  sel.addRange(range)
}

/** 输入事件：同步 taskInput 快照 + 与 store 勾选对账（退格整删 token 后清理过期勾选） */
const onInputSync = (): void => {
  const el = getInputEl()
  if (!el) return
  // 用户清空内容后浏览器可能残留 <br>，清掉让 :empty 占位符恢复。
  // 注意：Chromium 的 innerText 包含 contentEditable=false 的 token 文本，因此仅剩文件 token 时
  // innerText 非空、守卫不触发——querySelector 分支是防御未来 token 渲染变化（如 display:none），非当前承重。
  if (
    el.innerText.trim() === '' &&
    el.innerHTML !== '' &&
    !el.querySelector('.file-token')
  ) {
    el.innerHTML = ''
  }
  taskInput.value = el.innerText
  // 对账：DOM 中不存在的 token 从勾选中移除（退格键/选择删除路径）
  const domIds = new Set(
    Array.from(el.querySelectorAll<HTMLElement>('.skill-token')).map((t) =>
      Number(t.dataset.skillId)
    )
  )
  for (const id of [...catalog.selectedSkillIds]) {
    if (!domIds.has(id)) catalog.toggleSkill(id)
  }
}

// ── 消息区滚动状态（追滚/回顶回底按钮的数据源）──
const messagesScrollRef = ref<HTMLElement | null>(null)
const SCROLL_NEAR_EDGE = 40
const atTop = ref(true)
const atBottom = ref(true)

/** 由容器 scroll 事件驱动：按 40px 阈值刷新「接近顶部/底部」状态 */
const updateScrollState = (): void => {
  const el = messagesScrollRef.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  atTop.value = el.scrollTop <= SCROLL_NEAR_EDGE
  atBottom.value = el.scrollTop >= max - SCROLL_NEAR_EDGE
}

/** 容器挂载时刷新一次状态（初次渲染无 scroll 事件，避免状态残留默认值） */
watch(messagesScrollRef, (el) => {
  if (!el) return
  updateScrollState()
  // 回显路径：页面挂载时消息已加载（从其它标签切到新建任务打开会话），直接滚底
  if (currentMessages.value.length > 0) scrollMessagesToBottom()
})

/** 回顶/回底跳转（按钮点击，smooth 滚动） */
const scrollToTop = (): void => {
  messagesScrollRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

const scrollToBottom = (): void => {
  const el = messagesScrollRef.value
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
}

// ── 「+」菜单选中状态展示 ──
const MODE_LABELS: Record<Mode, string> = {
  default: '默认',
  local: '本地文件',
  knowledge: '知识库'
}

interface SelectionChip {
  key: string
  label: string
  kind: 'mode'
}

/** 输入卡左上角 chips：模式（非默认）——文件已改为输入框内联 token，不再显示 chips */
const selectionChips = computed<SelectionChip[]>(() => {
  if (catalog.mode === 'default') return []
  return [{ key: 'mode', label: `模式 · ${MODE_LABELS[catalog.mode]}`, kind: 'mode' }]
})

/** 点击 chip 移除对应选择（模式回默认） */
const removeChip = (chip: SelectionChip): void => {
  if (chip.kind === 'mode') catalog.setMode('default')
}

/** 移除专家选择（提示词由 watcher 从输入框移除） */
const removeExpert = (): void => {
  catalog.clearExpert()
}

/** 从输入框文本中剔除提示词原文（前缀优先，兜底扫描任意文本节点） */
const removePromptFromDom = (el: HTMLElement, prompt: string): void => {
  const prefix = prompt + '\n'
  const first = el.firstChild
  if (first && first.nodeType === Node.TEXT_NODE && (first.textContent ?? '').startsWith(prefix)) {
    const rest = (first.textContent ?? '').slice(prefix.length)
    if (rest) first.textContent = rest
    else el.removeChild(first)
    return
  }
  // 兜底：提示词被编辑/移位时，在任何文本节点中剔除原文
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').includes(prompt)) {
      node.textContent = (node.textContent ?? '').split(prompt).join('').replace(/^\n+/, '')
      return
    }
  }
}

/** 专家提示词 ↔ contenteditable DOM 同步（插入开头；切换专家先剔除旧提示词再插入新提示词） */
const syncExpertPromptToDom = (el: HTMLElement, prompt: string, prev: string): void => {
  if (prompt && prev && prompt !== prev && el.innerText.includes(prev)) {
    // 切换专家：先剔除上一个专家的提示词，避免叠加成两条
    removePromptFromDom(el, prev)
  }
  if (prompt && !el.innerText.includes(prompt)) {
    el.insertBefore(document.createTextNode(prompt + '\n'), el.firstChild)
  } else if (!prompt && prev) {
    removePromptFromDom(el, prev)
  }
  taskInput.value = el.innerText
}

watch(
  () => catalog.selectedExpertPrompt,
  (prompt, prev) => {
    const el = getInputEl()
    if (el) syncExpertPromptToDom(el, prompt, prev ?? '')
    else pendingExpertPromptSync.value = true
  },
  { immediate: true }
)

/** 输入框挂载时同步待处理提示词；欢迎态卸载时清理未发送草稿的勾选 */
watch([welcomeInputRef, chatInputRef], ([w, c]) => {
  const el = getInputEl()
  if (el && pendingExpertPromptSync.value) {
    pendingExpertPromptSync.value = false
    syncExpertPromptToDom(el, catalog.selectedExpertPrompt, '')
  }
  // 欢迎态输入框卸载（如侧栏打开历史会话）：草稿随 DOM 丢弃，同步清理技能勾选
  if (w === null && c !== null && taskInput.value.trim()) {
    catalog.clearSkills()
    taskInput.value = ''
  }
})

/** 菜单内导航 → Home 切换页面（具体标签页由 catalog store 的 pageTab 决定） */
const onPlusNavigate = (): void => {
  showInputPlusMenu.value = false
  emit('navigate', '专家·技能·连接器')
}

// ── Workspace selector 状态 ──
const wsMenuOpen = ref(false)
const showCreateModal = ref(false)
const createName = ref('')
const createError = ref('')
const creating = ref(false)

// ── Chat 态右侧栏 ──
const panelFullscreen = ref(false)

// 右侧栏全屏切换：.chat-main 以 v-show 隐藏会重置 scrollTop，恢复后刷新滚动状态（防按钮/追滚读陈旧值）
watch(panelFullscreen, () => {
  nextTick(updateScrollState)
})

// ── AI 消息操作栏 ──
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
const showToast = (text: string): void => {
  toast.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 1500)
}

/** 点赞/点踩本地状态（按消息 id） */
const feedbackMap = ref<Record<string, 'up' | 'down' | null>>({})
const toggleFeedback = (msgId: string, kind: 'up' | 'down'): void => {
  const cur = feedbackMap.value[msgId]
  feedbackMap.value[msgId] = cur === kind ? null : kind
}

/** 复制文本到剪贴板（clipboard + execCommand fallback） */
async function copyText(text: string, okText = '已复制'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  showToast(okText)
}

/** 朗读 AI 回复（Web Speech API；无引擎降级提示） */
const speakingMsgId = ref<string | null>(null)
const toggleSpeak = (msg: { id: string; content: string }): void => {
  if (!('speechSynthesis' in window)) {
    showToast('当前环境不支持语音朗读')
    return
  }
  if (speakingMsgId.value === msg.id) {
    window.speechSynthesis.cancel()
    speakingMsgId.value = null
    return
  }
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(msg.content)
  utter.lang = 'zh-CN'
  speakingMsgId.value = msg.id
  utter.onend = () => {
    speakingMsgId.value = null
  }
  utter.onerror = () => {
    speakingMsgId.value = null
  }
  window.speechSynthesis.speak(utter)
  // 降级：speak 后 1.5s 未进入朗读状态视为不支持
  setTimeout(() => {
    if (speakingMsgId.value === msg.id && !window.speechSynthesis.speaking) {
      speakingMsgId.value = null
      showToast('当前环境不支持语音朗读')
    }
  }, 1500)
}

// ── 分享选择模式 ──
/** 分享面板开启：每条消息左侧出现复选框，底部出现操作面板 */
const shareMode = ref(false)
const shareSelected = ref<string[]>([])

const shareAllChecked = computed(
  () => messages.value.length > 0 && shareSelected.value.length === messages.value.length
)
const shareAllIndeterminate = computed(
  () => shareSelected.value.length > 0 && shareSelected.value.length < messages.value.length
)

const isShareSelected = (id: string): boolean => shareSelected.value.includes(id)

const toggleShareSelected = (id: string): void => {
  const i = shareSelected.value.indexOf(id)
  if (i >= 0) shareSelected.value.splice(i, 1)
  else shareSelected.value.push(id)
}

/** 全选/取消全选（收敛为方法，避免模板内多语句表达式） */
const toggleShareAll = (): void => {
  shareSelected.value = shareAllChecked.value ? [] : messages.value.map((m) => m.id)
}

/** 打开分享面板（同时收起对话内搜索，避免视觉叠加） */
const openSharePanel = (): void => {
  closeSearch()
  shareMode.value = true
}

/** 关闭分享面板并清空选中（收敛为方法，避免模板内多语句表达式） */
const closeSharePanel = (): void => {
  shareMode.value = false
  shareSelected.value = []
}

/** 分享链接：本地自定义协议（未来云端模式可切换 https 分享服务地址） */
const shareLink = computed(
  () => `kework://conversation/${agentStore.currentConversationId ?? 'new'}`
)

/** 选中消息拼文本（用户/AI 前缀，过滤空内容） */
const shareSelectedText = (): string =>
  messages.value
    .filter((m) => shareSelected.value.includes(m.id))
    .map((m) => (m.role === 'user' ? `[用户] ${m.content}` : `[AI] ${m.content}`))
    .filter((t) => t.trim().length > 0)
    .join('\n\n')

/** 分享到微信：复制选中对话文本，由用户粘贴到微信发送 */
const shareToWechat = (): void => {
  const text = shareSelectedText()
  if (!text) return showToast('请先选择要分享的消息')
  copyText(text, '已复制，请在微信中粘贴分享')
}

/** 分享到朋友圈：同微信，复制文本 */
const shareToMoments = (): void => {
  const text = shareSelectedText()
  if (!text) return showToast('请先选择要分享的消息')
  copyText(text, '已复制，请在朋友圈中粘贴分享')
}

/** 复制分享链接 */
const copyShareLink = (): void => {
  copyText(shareLink.value, '分享链接已复制')
}

/** 浏览器打开分享链接（本地自定义协议，未注册时由系统提示） */
const openShareInBrowser = (): void => {
  window.api.openExternal(shareLink.value)
}

// ── 分享二维码 ──
const qrModalOpen = ref(false)
const qrDataUrl = ref('')
const qrGenerating = ref(false)

/** 生成分享链接二维码并弹出展示 */
const generateQr = async (): Promise<void> => {
  qrModalOpen.value = true
  qrGenerating.value = true
  qrDataUrl.value = ''
  try {
    qrDataUrl.value = await QRCode.toDataURL(shareLink.value, { width: 240, margin: 1 })
  } catch (err) {
    console.error('[share] 二维码生成失败:', err)
    qrDataUrl.value = ''
  } finally {
    qrGenerating.value = false
  }
}

/** 关闭二维码弹窗（收敛为方法，避免模板内多语句表达式） */
const closeQrModal = (): void => {
  qrModalOpen.value = false
  qrDataUrl.value = ''
}

// ── 格式化工具 ──
const formatDuration = (ms: number): string => {
  if (ms < 1000) return '共 <1s'
  if (ms < 60_000) return `共 ${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `共 ${m}m ${s}s`
}

const formatTime = (ts: number): string => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── 历史提问下拉 ──
const historyMenuOpen = ref(false)
const historyQuestions = computed(() =>
  messages.value
    .filter((m) => m.role === 'user')
    .slice()
    .reverse()
)

// ── 对话内搜索 ──
const searchOpen = ref(false)
const searchKeyword = ref('')
const searchIndex = ref(0)
const suppressAutoScroll = ref(false)

/** 关闭搜索并清空关键词（收敛为方法，避免模板内多语句表达式） */
const closeSearch = (): void => {
  searchOpen.value = false
  searchKeyword.value = ''
}

const searchMatches = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return []
  return messages.value.filter(
    (m) => m.content.toLowerCase().includes(kw) || (m.reasoning ?? '').toLowerCase().includes(kw)
  )
})

watch(searchKeyword, () => {
  searchIndex.value = 0
})

const hitSet = computed(() => new Set(searchMatches.value.map((m) => m.id)))
const currentHitId = computed(() => searchMatches.value[searchIndex.value]?.id ?? null)

/** 滚动定位到消息（suppressAutoScroll 防与底部自动滚动竞争） */
const scrollToMsg = (id: string): void => {
  suppressAutoScroll.value = true
  nextTick(() => {
    document
      .querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => {
      suppressAutoScroll.value = false
    }, 600)
  })
}

const gotoSearch = (dir: 1 | -1): void => {
  const total = searchMatches.value.length
  if (total === 0) return
  searchIndex.value = (searchIndex.value + dir + total) % total
  const target = searchMatches.value[searchIndex.value]
  if (target) scrollToMsg(target.id)
}

const jumpToQuestion = (id: string): void => {
  historyMenuOpen.value = false
  scrollToMsg(id)
}

/** 重新生成最后一条回复 */
const regenerateLast = (): void => {
  // 用户主动触发的消息动作：即使向上翻阅过也强制回到底部跟随
  atBottom.value = true
  agentStore.regenerate({
    model: model.value,
    customModelId: selectedCustomId.value ?? undefined
  })
}

// ── Computed ──
const messages = computed(() => {
  return currentMessages.value.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    reasoning: m.reasoning,
    createdAt: m.createdAt,
    durationMs: m.durationMs,
    model: m.model
  }))
})
const thinking = computed(() => {
  const val = isStreaming.value || isThinking.value
  return val
})

// 思考块折叠状态：按消息 id 记录（regenerate 截断后 index 会错位）
const thinkingCollapsed = ref<Record<string, boolean>>({})

const toggleThinking = (msgId: string): void => {
  thinkingCollapsed.value[msgId] = !thinkingCollapsed.value[msgId]
}

const isLastAssistant = (msgId: string): boolean => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === 'assistant') {
      return messages.value[i].id === msgId
    }
  }
  return false
}

// ── Constants ──
const categories = [
  { key: 'work', label: '日常办公', icon: '☀️' },
  { key: 'code', label: '代码开发', icon: '</>' },
  { key: 'design', label: '设计创意', icon: '🎨' }
]

const quickChips = [
  { icon: 'doc', label: '文档处理' },
  { icon: 'chart', label: '金融服务' },
  { icon: 'chart', label: '数据分析及可视化' },
  { icon: 'research', label: '深度研究' },
  { icon: 'video', label: '视频生成' },
  { icon: 'slides', label: '幻灯片' }
]

// ── 文件附件：选中即时校验（主进程权威，此处为 UX 前置副本） ──
const FILE_TEXT_EXTS = ['txt','md','csv','json','yaml','yml','xml','html','css','js','ts','jsx','tsx','py','java','c','cpp','h','go','rs','sh','sql','log','ini','toml']
const FILE_IMAGE_EXTS = ['png','jpg','jpeg','gif','webp','bmp']
const FILE_MAX_TEXT_BYTES = 5 * 1024 * 1024
const FILE_MAX_PDF_BYTES = 20 * 1024 * 1024
const FILE_MAX_IMAGE_BYTES = 10 * 1024 * 1024
const FILE_MAX_COUNT = 10

/** 内置模型（仅 Auto 走默认 agent 配置；Qing 系列等模型已迁至 models.json，经 modelStore 追加展示） */
const BUILTIN_MODELS = ['Auto']

/** 当前选中的自定义模型 id（发送/重新生成时随 customModelId 传主进程；内置模型为 null） */
const selectedCustomId = ref<string | null>(null)

/** 模型下拉分组：内置 + 自定义（自定义模型名可重复，id 唯一，故按 id 传参） */
const modelGroups = computed(() => [
  { name: '内置模型', items: BUILTIN_MODELS.map((name) => ({ name, id: undefined as string | undefined })) },
  { name: '自定义模型', items: modelStore.models.map((m) => ({ name: m.name, id: m.id })) }
])

// ── Methods ──
const selectModel = (opt: { name: string; id?: string }): void => {
  model.value = opt.name
  selectedCustomId.value = opt.id ?? null
  modelOpen.value = false
}

/** hover 菜单控制器：按钮移入打开，移出延迟关闭（给鼠标移入菜单留时间），菜单移入取消延迟、移出立即关闭 */
interface HoverMenu {
  open: () => void
  scheduleClose: () => void
  cancelClose: () => void
  closeNow: () => void
}

const createHoverMenu = (flag: Ref<boolean>): HoverMenu => {
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  const open = (): void => {
    if (closeTimer) clearTimeout(closeTimer)
    flag.value = true
  }
  const scheduleClose = (): void => {
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      flag.value = false
    }, 200)
  }
  const cancelClose = (): void => {
    if (closeTimer) clearTimeout(closeTimer)
  }
  const closeNow = (): void => {
    if (closeTimer) clearTimeout(closeTimer)
    flag.value = false
  }
  return { open, scheduleClose, cancelClose, closeNow }
}

/** 模型下拉 / 「+」菜单由点击切换改为 hover 开关 */
const modelMenuHover = createHoverMenu(modelOpen)
const plusMenuHover = createHoverMenu(showInputPlusMenu)

const scrollChips = (dir: 'left' | 'right'): void => {
  const el = chipsScrollRef.value
  if (!el) return
  el.scrollBy({ left: dir === 'right' ? 120 : -120, behavior: 'smooth' })
}

const sendMessage = (): void => {
  const el = getInputEl()
  const parts = el ? serializeInput(el) : [{ type: 'text' as const, text: taskInput.value }]
  const hasFile = parts.some((p) => p.type === 'file')
  const text = parts.filter((p) => p.type === 'text').map((p) => p.text).join('').trim()
  if (!hasFile && !text) return
  // 清空输入框（DOM + 快照 + 技能勾选 + 抑制挂载时提示词重插）
  if (el) el.textContent = ''
  taskInput.value = ''
  pendingExpertPromptSync.value = false
  catalog.clearSkills()
  // 用户主动触发的消息动作：即使向上翻阅过也强制回到底部跟随
  atBottom.value = true
  agentStore
    .sendMessage(parts, {
      model: model.value,
      customModelId: selectedCustomId.value ?? undefined
    })
    .catch((err: unknown) => {
      console.error('[NewTaskPage] sendMessage failed:', err)
      // 失败时恢复输入内容：仅恢复文本段（文件 token 不恢复，与现状 token 恢复为纯文本一致）
      const restoreText = parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('')
      const cur = getInputEl()
      if (cur) cur.textContent = restoreText
      taskInput.value = restoreText
    })
}

// ── Workspace selector handlers ──

/** 选中列表中的工作空间 */
const pickWorkspace = (ws: { id: string }): void => {
  workspaceStore.select(ws.id)
  wsMenuOpen.value = false
}

/** 打开本地文件夹作为工作空间 */
const pickExternal = async (): Promise<void> => {
  wsMenuOpen.value = false
  await workspaceStore.selectExternal()
}

/** 使用默认工作空间（~/KeWork/DefaultWorkspace，未选择任何空间时的兜底目录） */
const pickDefault = async (): Promise<void> => {
  wsMenuOpen.value = false
  await workspaceStore.useDefault()
}

/** 打开"新建工作空间"弹窗 */
const openCreateModal = (): void => {
  wsMenuOpen.value = false
  createName.value = ''
  createError.value = ''
  showCreateModal.value = true
}

// ── 权限菜单：默认权限 / 允许完全访问（渲染层本地状态，localStorage 持久化） ──
const FULL_ACCESS_KEY = 'ke-work.full-access'
const fullAccess = ref(localStorage.getItem(FULL_ACCESS_KEY) === '1')
const permMenuOpen = ref(false)
const showPermConfirm = ref(false)
const riskChecked = ref(false)

watch(fullAccess, (v) => {
  localStorage.setItem(FULL_ACCESS_KEY, v ? '1' : '0')
})

/** 点击开关：关闭→开启需经风险确认弹窗；开启→关闭直接切换 */
const onPermSwitchClick = (): void => {
  if (fullAccess.value) {
    fullAccess.value = false
  } else {
    riskChecked.value = false
    showPermConfirm.value = true
  }
}

/** 确认开启：勾选「我已了解风险」后按钮才可点（disabled 由模板控制） */
const confirmFullAccess = (): void => {
  fullAccess.value = true
  showPermConfirm.value = false
}

/** 取消：关闭弹窗，开关保持关闭 */
const cancelFullAccess = (): void => {
  showPermConfirm.value = false
}

/** 确认创建：主进程 sanitize 是权威校验，错误经 createError 展示 */
const confirmCreate = async (): Promise<void> => {
  const name = createName.value.trim()
  if (!name || creating.value) return
  creating.value = true
  createError.value = ''
  try {
    await workspaceStore.create(name)
    showCreateModal.value = false
    createName.value = ''
  } catch (err) {
    createError.value = err instanceof Error ? err.message : '新建工作空间失败'
  } finally {
    creating.value = false
  }
}

// ── Close menus on outside click ──
const handleDocumentClick = (e: MouseEvent): void => {
  const target = e.target as HTMLElement
  if (!target.closest('[data-plus-menu-trigger]') && !target.closest('.plus-menu')) {
    showInputPlusMenu.value = false
  }
  if (!target.closest('[data-workspace-menu-trigger]') && !target.closest('.workspace-menu')) {
    wsMenuOpen.value = false
  }
  if (!target.closest('[data-history-menu-trigger]') && !target.closest('.history-menu')) {
    historyMenuOpen.value = false
  }
  if (!target.closest('[data-perm-menu-trigger]') && !target.closest('.perm-menu')) {
    permMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick)
  // 自定义模型列表（设置页新增后聊天页下拉同步刷新；失败静默保留旧值）
  void modelStore.load()
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentClick)
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  // 输入框随页面卸载：丢弃未发送草稿的技能勾选（发送路径已清空，此处兜底导航/重挂载）
  if (taskInput.value.trim()) catalog.clearSkills()
})

// 最后一条 assistant 消息的正文+思考长度（流式逐块增长时驱动实时追滚）
const lastAssistantContentLen = computed(() => {
  for (let i = currentMessages.value.length - 1; i >= 0; i--) {
    const m = currentMessages.value[i]
    if (m.role === 'assistant') {
      return (m.content?.length ?? 0) + (m.reasoning?.length ?? 0)
    }
  }
  return 0
})

/** 用户位于底部时，把消息区滚到底部（瞬时赋值，流式高频增长不用 smooth） */
const scrollMessagesToBottom = (): void => {
  const el = messagesScrollRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
  updateScrollState()
}

// 消息增删 / 流式开始结束：位于底部时滚底（搜索/历史提问定位期间抑制）
watch(
  () => [currentMessages.value.length, isStreaming.value],
  () => {
    if (suppressAutoScroll.value) return
    if (!atBottom.value) return
    nextTick(scrollMessagesToBottom)
  }
)

// 流式内容逐块增长：位于底部时实时追滚（用户向上翻阅后 atBottom=false 即暂停跟随）
watch(lastAssistantContentLen, () => {
  if (suppressAutoScroll.value) return
  if (!atBottom.value) return
  nextTick(scrollMessagesToBottom)
})

// ── 历史会话回显：切换会话后等消息加载完成滚到底部（修复残留上次滚动位置问题）──
const echoPendingScroll = ref(false)

watch(
  () => agentStore.currentConversationId,
  () => {
    echoPendingScroll.value = true
  }
)

watch(
  () => currentMessages.value.length,
  (len) => {
    if (echoPendingScroll.value && len > 0) {
      echoPendingScroll.value = false
      nextTick(scrollMessagesToBottom)
    }
  }
)
</script>

<template>
  <div class="new-task-page">
    <!-- Welcome state -->
    <div v-if="currentMessages.length === 0" class="welcome-area">
      <h2 class="welcome-heading">KE-WORK，<span class="welcome-highlight">我帮你</span></h2>

      <!-- Category pills -->
      <div class="category-pills">
        <button
          v-for="cat in categories"
          :key="cat.key"
          :class="['category-pill', { 'category-pill--active': category === cat.key }]"
          @click="category = cat.key"
        >
          <span>{{ cat.icon }}</span>
          {{ cat.label }}
        </button>
      </div>

      <!-- Quick chips + mascot -->
      <div class="chips-row">
        <button class="chips-scroll-btn chips-scroll-btn--left" @click="scrollChips('left')">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div ref="chipsScrollRef" class="chips-scroll">
          <button v-for="chip in quickChips" :key="chip.label" class="quick-chip">
            <span class="chip-icon">
              <svg
                v-if="chip.icon === 'doc'"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <svg
                v-else-if="chip.icon === 'chart'"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <svg
                v-else-if="chip.icon === 'research'"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <svg
                v-else-if="chip.icon === 'video'"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
              <svg
                v-else-if="chip.icon === 'slides'"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </span>
            {{ chip.label }}
          </button>
        </div>
        <button class="chips-scroll-btn chips-scroll-btn--right" @click="scrollChips('right')">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
        <!-- Robot mascot -->
        <svg class="mascot" width="72" height="72" viewBox="0 0 88 88" fill="none">
          <defs>
            <linearGradient id="rmg1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#e2e8f0" />
              <stop offset="100%" stop-color="#cbd5e1" />
            </linearGradient>
            <linearGradient id="rmg2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#0891b2" />
              <stop offset="100%" stop-color="#0e7490" />
            </linearGradient>
          </defs>
          <rect x="24" y="44" width="40" height="28" rx="10" fill="url(#rmg1)" />
          <rect x="32" y="52" width="24" height="14" rx="5" fill="url(#rmg2)" opacity="0.9" />
          <circle cx="38" cy="57" r="2" fill="#22d3ee" opacity="0.9" />
          <circle cx="44" cy="57" r="2" fill="#67e8f9" opacity="0.7" />
          <circle cx="50" cy="57" r="2" fill="#06b6d4" opacity="0.8" />
          <rect x="36" y="61" width="16" height="2" rx="1" fill="#cffafe" opacity="0.6" />
          <rect x="38" y="40" width="12" height="6" rx="3" fill="url(#rmg1)" />
          <rect x="18" y="14" width="52" height="28" rx="14" fill="url(#rmg1)" />
          <path d="M22 20 L16 8 L30 16Z" fill="#cbd5e1" />
          <path d="M66 20 L72 8 L58 16Z" fill="#cbd5e1" />
          <path d="M23 19 L19 11 L29 17Z" fill="#f1a1c0" opacity="0.5" />
          <path d="M65 19 L69 11 L59 17Z" fill="#f1a1c0" opacity="0.5" />
          <rect x="28" y="24" width="12" height="10" rx="5" fill="white" />
          <rect x="48" y="24" width="12" height="10" rx="5" fill="white" />
          <circle cx="34" cy="29" r="4" fill="#1e293b" />
          <circle cx="54" cy="29" r="4" fill="#1e293b" />
          <circle cx="35.5" cy="27.5" r="1.5" fill="white" />
          <circle cx="55.5" cy="27.5" r="1.5" fill="white" />
          <rect
            x="27"
            y="23"
            width="14"
            height="12"
            rx="6"
            fill="none"
            stroke="url(#rmg2)"
            stroke-width="1.5"
          />
          <rect
            x="47"
            y="23"
            width="14"
            height="12"
            rx="6"
            fill="none"
            stroke="url(#rmg2)"
            stroke-width="1.5"
          />
          <ellipse cx="44" cy="37" rx="3" ry="1.5" fill="#94a3b8" />
          <path
            d="M40 40 Q44 43 48 40"
            stroke="#94a3b8"
            stroke-width="1.2"
            stroke-linecap="round"
            fill="none"
          />
          <path
            d="M16 27 Q14 20 20 16"
            stroke="#0891b2"
            stroke-width="3"
            stroke-linecap="round"
            fill="none"
          />
          <rect x="12" y="26" width="8" height="10" rx="4" fill="url(#rmg2)" />
          <path
            d="M72 27 Q74 20 68 16"
            stroke="#0891b2"
            stroke-width="3"
            stroke-linecap="round"
            fill="none"
          />
          <rect x="68" y="26" width="8" height="10" rx="4" fill="url(#rmg2)" />
          <rect x="10" y="48" width="14" height="18" rx="7" fill="url(#rmg1)" />
          <rect x="64" y="48" width="14" height="18" rx="7" fill="url(#rmg1)" />
          <rect x="28" y="70" width="12" height="8" rx="4" fill="#cbd5e1" />
          <rect x="48" y="70" width="12" height="8" rx="4" fill="#cbd5e1" />
        </svg>
      </div>

      <!-- Input card -->
      <div class="input-card">
        <div
          ref="welcomeInputRef"
          class="task-textarea"
          :class="{ 'task-textarea--dragging': inputDragging }"
          contenteditable="true"
          data-placeholder="今天帮你做些什么？  @ 引用对话文件，/ 调用技能与指令"
          @input="onInputSync"
          @click="onInputClick"
          @keydown.enter.exact.prevent="sendMessage"
          @dragenter="onInputDragEnter"
          @dragover="onInputDragOver"
          @dragleave="onInputDragLeave"
          @drop="onInputDrop"
        ></div>
        <div v-if="selectionChips.length" class="selection-chips">
          <span
            v-for="chip in selectionChips"
            :key="chip.key"
            class="selection-chip"
            @click="removeChip(chip)"
          >
            <svg
              class="selection-chip-del"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span class="selection-chip-name">{{ chip.label }}</span>
          </span>
        </div>
        <div class="input-toolbar">
          <button
            class="toolbar-btn"
            data-plus-menu-trigger
            @mouseenter="plusMenuHover.open"
            @mouseleave="plusMenuHover.scheduleClose"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <div v-if="catalog.selectedExpert" class="expert-chip" @click="removeExpert">
            <span class="expert-chip-avatar" :style="{ background: catalog.selectedExpert.color }">
              <span class="expert-chip-avatar-text">{{ catalog.selectedExpert.initials }}</span>
              <svg
                class="expert-chip-avatar-del"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
            <span class="expert-chip-name">{{ catalog.selectedExpert.name }}</span>
          </div>
          <button
            class="toolbar-btn"
            :class="{ 'toolbar-btn--polishing': polishing }"
            :disabled="polishing"
            title="AI 改写润色"
            @click="onPolishClick"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L13 7H5L9 2Z" fill="#0891b2" opacity="0.7" />
              <path d="M9 16L13 11H5L9 16Z" fill="#0891b2" opacity="0.9" />
              <path d="M2 9L7 5V13L2 9Z" fill="#06b6d4" opacity="0.7" />
              <path d="M16 9L11 5V13L16 9Z" fill="#06b6d4" opacity="0.9" />
            </svg>
          </button>
          <div class="toolbar-spacer"></div>
          <!-- Model selector -->
          <div class="model-selector">
            <button
              class="model-btn"
              @mouseenter="modelMenuHover.open"
              @mouseleave="modelMenuHover.scheduleClose"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {{ model }}
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <Transition name="dropdown">
              <div
                v-if="modelOpen"
                class="model-dropdown"
                @mouseenter="modelMenuHover.cancelClose"
                @mouseleave="modelMenuHover.closeNow"
              >
                <template
                  v-for="group in modelGroups"
                  :key="group.name"
                >
                  <div
                    v-if="group.items.length > 0"
                    class="model-group-label"
                  >
                    {{ group.name }}
                  </div>
                  <button
                    v-for="opt in group.items"
                    :key="opt.id ?? opt.name"
                    :class="['model-option', { 'model-option--active': model === opt.name }]"
                    @click="selectModel(opt)"
                  >
                    <svg
                      v-if="model === opt.name"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span v-else class="model-option-gap"></span>
                    {{ opt.name }}
                  </button>
                </template>
              </div>
            </Transition>
          </div>
          <button class="toolbar-btn">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          <!-- 发送/停止按钮 -->
          <button
            v-if="!isStreaming"
            class="send-btn"
            :class="{ 'send-btn--active': taskInput.trim() }"
            @click="sendMessage"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
          <button v-else class="send-btn send-btn--stop" @click="agentStore.cancelMessage()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
          <!-- Plus Menu -->
          <Transition name="plus-menu-slide">
            <PlusMenu
              v-if="showInputPlusMenu"
              @mouseenter="plusMenuHover.cancelClose"
              @mouseleave="plusMenuHover.closeNow"
              @select-skill="onSelectSkillToken"
              @select-files="onSelectFiles"
              @close="showInputPlusMenu = false"
              @navigate="onPlusNavigate"
            />
          </Transition>
        </div>

        <div class="input-footer">
          <div class="workspace-selector">
            <button
              class="footer-action"
              data-workspace-menu-trigger
              @click="wsMenuOpen = !wsMenuOpen"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                />
              </svg>
              {{ workspaceStore.currentWorkspace?.name ?? '选择工作空间' }}
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <Transition name="plus-menu-slide">
              <div v-if="wsMenuOpen" class="workspace-menu" @click.stop>
                <!-- ① 搜索工作空间 -->
                <div class="ws-search">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    v-model="workspaceStore.query"
                    type="text"
                    placeholder="搜索工作空间"
                    class="ws-search-input"
                  />
                </div>
                <!-- ② 已创建工作空间列表 -->
                <div class="ws-list">
                  <button
                    v-for="ws in workspaceStore.filteredWorkspaces"
                    :key="ws.id"
                    class="ws-item"
                    @click="pickWorkspace(ws)"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      class="ws-item-icon"
                    >
                      <path
                        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                      />
                    </svg>
                    <span class="ws-item-name">{{ ws.name }}</span>
                    <svg
                      v-if="ws.id === workspaceStore.currentId"
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      class="ws-item-check"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <p v-if="workspaceStore.filteredWorkspaces.length === 0" class="ws-empty">
                    无匹配的工作空间
                  </p>
                </div>
                <div class="ws-divider"></div>
                <!-- ③ 新建工作空间 -->
                <button class="ws-item" @click="openCreateModal">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="ws-item-icon"
                  >
                    <path
                      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                    />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                  <span class="ws-item-name">新建工作空间</span>
                </button>
                <!-- ④ 打开本地文件夹 -->
                <button class="ws-item" @click="pickExternal">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="ws-item-icon"
                  >
                    <path
                      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                    />
                    <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span class="ws-item-name">打开本地文件夹</span>
                </button>
                <!-- ⑤ 使用默认工作空间 -->
                <button class="ws-item" @click="pickDefault">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="ws-item-icon"
                  >
                    <polygon
                      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                    />
                  </svg>
                  <span class="ws-item-name">默认工作空间</span>
                </button>
              </div>
            </Transition>
          </div>
          <div class="perm-selector">
            <button
              class="footer-action"
              data-perm-menu-trigger
              @click="permMenuOpen = !permMenuOpen"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              默认权限
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <Transition name="plus-menu-slide">
              <div v-if="permMenuOpen" class="perm-menu" @click.stop>
                <p class="perm-desc">
                  当前为默认权限，所有操作都会在安全沙箱约束内进行，超出范围会请求你的允许。
                </p>
                <div class="perm-row">
                  <span class="perm-row-label">允许完全访问</span>
                  <button
                    class="perm-switch"
                    :class="{ 'perm-switch--on': fullAccess }"
                    type="button"
                    role="switch"
                    :aria-checked="fullAccess"
                    :title="'开启后将减少确认步骤，允许 AI 直接执行更多操作。可能涉及敏感操作、文件修改或外部执行'"
                    @click="onPermSwitchClick"
                  >
                    <span class="perm-switch-knob"></span>
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <!-- 允许完全访问风险确认 Modal（开关置开前的强制确认：勾选风险须知后才可继续） -->
      <Transition name="modal">
        <div v-if="showPermConfirm" class="perm-mask" @click.self="cancelFullAccess">
          <div class="perm-confirm-card">
            <div class="perm-confirm-header">
              <span>开启允许完全访问</span>
              <button
                class="perm-confirm-close"
                type="button"
                aria-label="关闭"
                @click="cancelFullAccess"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div class="perm-confirm-body">
              <p class="perm-confirm-message">
                开启允许完全访问后，AI 将减少确认步骤，并可直接执行更多操作，包括敏感操作、文件修改或外部执行。仅建议在您信任当前任务时使用。
              </p>
              <label class="perm-risk">
                <input v-model="riskChecked" type="checkbox" class="perm-risk-checkbox" />
                <span>我已了解风险，并愿意继续</span>
              </label>
            </div>
            <div class="perm-confirm-footer">
              <button
                class="perm-confirm-btn perm-confirm-btn--cancel"
                type="button"
                @click="cancelFullAccess"
              >
                取消
              </button>
              <button
                class="perm-confirm-btn perm-confirm-btn--confirm"
                type="button"
                :disabled="!riskChecked"
                @click="confirmFullAccess"
              >
                允许完全访问
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 新建工作空间 Modal -->
      <Transition name="modal">
        <div v-if="showCreateModal" class="modal-mask" @click.self="showCreateModal = false">
          <div class="modal-card">
            <div class="modal-header">
              <span>新建工作空间</span>
              <button class="modal-close" aria-label="关闭" @click="showCreateModal = false">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <label class="modal-label" for="ws-create-name">工作空间名称</label>
              <input
                id="ws-create-name"
                v-model="createName"
                class="modal-input"
                maxlength="50"
                placeholder="将创建于 ~/KeWork/ 目录下"
                @keydown.enter.prevent="confirmCreate"
              />
              <p v-if="createError" class="modal-error">{{ createError }}</p>
              <p class="modal-hint">将在系统家目录的 KeWork/ 下创建同名文件夹</p>
            </div>
            <div class="modal-footer">
              <button class="modal-btn modal-btn--cancel" @click="showCreateModal = false">
                取消
              </button>
              <button
                class="modal-btn modal-btn--confirm"
                :disabled="creating || !createName.trim()"
                @click="confirmCreate"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Chat state -->
    <div v-else class="chat-area">
      <div v-show="!panelFullscreen" class="chat-main">
        <!-- 会话标题栏 -->
        <header class="chat-header">
          <h1 class="chat-header-title">{{ agentStore.currentConversation?.title ?? '新对话' }}</h1>
          <div class="chat-header-actions">
            <!-- 对话内搜索条：浮层出现在"对话内搜索"图标左侧 -->
            <Transition name="searchbar">
              <div v-if="searchOpen" class="chat-search-bar">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  v-model="searchKeyword"
                  class="chat-search-input"
                  placeholder="搜索当前对话"
                />
                <span class="chat-search-count"
                  >{{ searchMatches.length ? searchIndex + 1 : 0 }}/{{ searchMatches.length }}</span
                >
                <button
                  class="chat-search-btn"
                  title="上一条"
                  :disabled="!searchMatches.length"
                  @click="gotoSearch(-1)"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
                <button
                  class="chat-search-btn"
                  title="下一条"
                  :disabled="!searchMatches.length"
                  @click="gotoSearch(1)"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <button class="chat-search-btn" title="关闭" @click="closeSearch">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </Transition>
            <button
              class="chat-header-btn"
              title="对话内搜索"
              :class="{ 'chat-header-btn--active': searchOpen }"
              @click="searchOpen = !searchOpen"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
            <button
              class="chat-header-btn"
              title="分享"
              :class="{ 'chat-header-btn--active': shareMode }"
              @click="openSharePanel"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
            <div class="chat-header-btn-wrap" data-history-menu-trigger>
              <button
                class="chat-header-btn"
                title="历史提问"
                @click="historyMenuOpen = !historyMenuOpen"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </button>
              <Transition name="dropdown">
                <div v-if="historyMenuOpen" class="history-menu">
                  <p class="history-menu-title">历史提问 ({{ historyQuestions.length }})</p>
                  <div class="history-menu-list">
                    <button
                      v-for="q in historyQuestions"
                      :key="q.id"
                      class="history-menu-item"
                      @click="jumpToQuestion(q.id)"
                    >
                      <span class="history-menu-text">{{ q.content }}</span>
                      <span v-if="q.createdAt" class="history-menu-time">{{
                        formatTime(q.createdAt)
                      }}</span>
                    </button>
                    <p v-if="historyQuestions.length === 0" class="history-menu-empty">暂无提问</p>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </header>

        <div ref="messagesScrollRef" class="chat-messages" @scroll="updateScrollState">
          <div
            v-for="msg in messages"
            :key="msg.id"
            :data-msg-id="msg.id"
            :class="[
              'chat-bubble-row',
              msg.role === 'user' ? 'chat-bubble-row--user' : 'chat-bubble-row--assistant',
              {
                'chat-msg--hit': hitSet.has(msg.id),
                'chat-msg--current': currentHitId === msg.id,
                'chat-msg-row--selected': isShareSelected(msg.id)
              }
            ]"
          >
            <!-- 分享选择模式：消息最左侧复选框 -->
            <label
              v-if="shareMode"
              class="chat-msg-check"
              :class="{ 'chat-msg-check--selected': isShareSelected(msg.id) }"
              :title="isShareSelected(msg.id) ? '取消选中' : '选中该消息'"
              @click.prevent="toggleShareSelected(msg.id)"
            >
              <input type="checkbox" :checked="isShareSelected(msg.id)" />
              <span class="chat-msg-check-box">
                <svg
                  v-if="isShareSelected(msg.id)"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </label>
            <!-- AI 回复：头像+名字在顶部，正文无背景色，底部操作栏 -->
            <template v-if="msg.role === 'assistant'">
              <div class="chat-bubble-head">
                <div class="chat-avatar chat-avatar--ai chat-avatar--sm">
                  <svg width="16" height="16" viewBox="0 0 64 64" fill="none">
                    <ellipse cx="32" cy="38" rx="12" ry="14" fill="#0891b2" />
                    <circle cx="32" cy="20" r="9" fill="#0891b2" />
                    <circle cx="29" cy="19" r="2.5" fill="white" />
                    <circle cx="29.5" cy="19" r="1.2" fill="#0e7490" />
                  </svg>
                </div>
                <span class="chat-bubble-head-name">KeWork</span>
              </div>
              <div class="chat-bubble-wrapper">
                <!-- 深度思考块 -->
                <div v-if="msg.reasoning" class="thinking-block">
                  <button class="thinking-header" @click="toggleThinking(msg.id)">
                    <span class="thinking-header-text">深度思考</span>
                    <svg
                      :class="[
                        'thinking-chevron',
                        { 'thinking-chevron--collapsed': thinkingCollapsed[msg.id] }
                      ]"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  <Transition name="thinking-collapse">
                    <div v-show="!thinkingCollapsed[msg.id]" class="thinking-body">
                      <MessageContent :content="msg.reasoning" content-type="markdown" />
                    </div>
                  </Transition>
                </div>
                <!-- 消息内容：有内容时渲染，空内容+流式输出时显示加载动画 -->
                <div v-if="msg.content" class="chat-bubble">
                  <MessageContent :content="msg.content" content-type="markdown" />
                </div>
                <div
                  v-else-if="isLastAssistant(msg.id) && thinking"
                  class="chat-bubble thinking-bubble"
                >
                  <span class="dot-pulse" style="animation-delay: 0s"></span>
                  <span class="dot-pulse" style="animation-delay: 0.15s"></span>
                  <span class="dot-pulse" style="animation-delay: 0.3s"></span>
                </div>
              </div>
              <!-- 操作栏：按钮组 + 元信息 -->
              <div v-if="msg.content" class="chat-msg-actions">
                <div class="chat-msg-action-group">
                  <button class="chat-msg-action-btn" title="复制" @click="copyText(msg.content)">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                  <button
                    class="chat-msg-action-btn"
                    :class="{ 'chat-msg-action-btn--active': feedbackMap[msg.id] === 'up' }"
                    title="点赞"
                    @click="toggleFeedback(msg.id, 'up')"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <path
                        d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
                      />
                    </svg>
                  </button>
                  <button
                    class="chat-msg-action-btn"
                    :class="{ 'chat-msg-action-btn--active': feedbackMap[msg.id] === 'down' }"
                    title="点踩"
                    @click="toggleFeedback(msg.id, 'down')"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <path
                        d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"
                      />
                    </svg>
                  </button>
                  <button
                    class="chat-msg-action-btn"
                    :class="{ 'chat-msg-action-btn--active': speakingMsgId === msg.id }"
                    title="朗读"
                    @click="toggleSpeak(msg)"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                  </button>
                  <button
                    class="chat-msg-action-btn"
                    title="重新生成"
                    :disabled="isStreaming || !isLastAssistant(msg.id)"
                    @click="regenerateLast"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </button>
                  <button class="chat-msg-action-btn" title="分享" @click="copyText(msg.content)">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  </button>
                  <button class="chat-msg-action-btn" title="更多">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <circle cx="12" cy="5" r="1" />
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="12" cy="19" r="1" />
                    </svg>
                  </button>
                </div>
                <div class="chat-msg-meta">
                  <span v-if="msg.durationMs" class="chat-msg-meta-item chat-msg-meta-item--strong">
                    {{ formatDuration(msg.durationMs) }}
                  </span>
                  <span class="chat-msg-meta-item">{{ msg.model ?? model }}</span>
                  <span v-if="msg.createdAt" class="chat-msg-meta-item">{{
                    formatTime(msg.createdAt)
                  }}</span>
                </div>
              </div>
            </template>
            <!-- 用户消息：无头像，浅灰背景 -->
            <template v-else>
              <div class="chat-bubble-wrapper chat-bubble-wrapper--user">
                <div class="chat-bubble chat-bubble--user">
                  <MessageContent :content="msg.content" content-type="markdown" />
                </div>
              </div>
            </template>
          </div>
        </div>
        <!-- 消息区滚动定位按钮：接近顶部→回底，接近底部→回顶；中间位置不显示 -->
        <button
          v-if="atTop && !atBottom"
          class="chat-scroll-jump"
          title="回到底部"
          @click="scrollToBottom"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <button
          v-else-if="atBottom && !atTop"
          class="chat-scroll-jump"
          title="回到顶部"
          @click="scrollToTop"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <!-- 分享面板：底部、输入栏上方，全选 + 5 个分享动作 + 关闭 -->
        <Transition name="share-panel">
          <div v-if="shareMode" class="share-panel">
            <label class="share-select-all" @click.prevent="toggleShareAll">
              <input type="checkbox" :checked="shareAllChecked" />
              <span
                class="share-select-all-box"
                :class="{ 'share-select-all-box--indeterminate': shareAllIndeterminate }"
              >
                <svg
                  v-if="shareAllChecked"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span v-else-if="shareAllIndeterminate" class="share-select-all-line"></span>
              </span>
              <span class="share-select-all-text"
                >全选 ({{ shareSelected.length }}/{{ messages.length }})</span
              >
            </label>
            <div class="share-panel-divider"></div>
            <button class="share-action" title="分享到微信" @click="shareToWechat">
              <span class="share-action-icon share-action-icon--wechat">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                >
                  <path
                    d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                  />
                </svg>
              </span>
              <span class="share-action-text">分享到微信</span>
            </button>
            <button class="share-action" title="分享到朋友圈" @click="shareToMoments">
              <span class="share-action-icon share-action-icon--moments">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="1.2" fill="currentColor" />
                  <path d="M12 2v4.5M12 17.5V22M2 12h4.5M17.5 12H22" />
                </svg>
              </span>
              <span class="share-action-text">分享到朋友圈</span>
            </button>
            <button class="share-action" title="复制链接" @click="copyShareLink">
              <span class="share-action-icon share-action-icon--link">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </span>
              <span class="share-action-text">复制链接</span>
            </button>
            <button class="share-action" title="生成二维码" @click="generateQr">
              <span class="share-action-icon share-action-icon--qr">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3h-3zM21 14v3M14 21h3" />
                </svg>
              </span>
              <span class="share-action-text">生成二维码</span>
            </button>
            <button class="share-action" title="浏览器打开" @click="openShareInBrowser">
              <span class="share-action-icon share-action-icon--browser">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path
                    d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                  />
                </svg>
              </span>
              <span class="share-action-text">浏览器打开</span>
            </button>
            <div class="share-panel-spacer"></div>
            <button class="share-close" title="关闭" @click="closeSharePanel">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </Transition>
        <!-- Compact input -->
        <div class="chat-input-bar">
          <div class="chat-input-card">
            <div
              ref="chatInputRef"
              class="task-textarea task-textarea--compact"
              :class="{ 'task-textarea--dragging': inputDragging }"
              contenteditable="true"
              data-placeholder="继续输入…"
              @input="onInputSync"
              @click="onInputClick"
              @keydown.enter.exact.prevent="sendMessage"
              @dragenter="onInputDragEnter"
              @dragover="onInputDragOver"
              @dragleave="onInputDragLeave"
              @drop="onInputDrop"
            ></div>
            <div v-if="selectionChips.length" class="selection-chips selection-chips--compact">
              <span
                v-for="chip in selectionChips"
                :key="chip.key"
                class="selection-chip"
                @click="removeChip(chip)"
              >
                <svg
                  class="selection-chip-del"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span class="selection-chip-name">{{ chip.label }}</span>
              </span>
            </div>
            <div class="input-toolbar input-toolbar--compact">
              <button
                class="toolbar-btn"
                data-plus-menu-trigger
                @mouseenter="plusMenuHover.open"
                @mouseleave="plusMenuHover.scheduleClose"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <div v-if="catalog.selectedExpert" class="expert-chip" @click="removeExpert">
                <span
                  class="expert-chip-avatar"
                  :style="{ background: catalog.selectedExpert.color }"
                >
                  <span class="expert-chip-avatar-text">{{ catalog.selectedExpert.initials }}</span>
                  <svg
                    class="expert-chip-avatar-del"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </span>
                <span class="expert-chip-name">{{ catalog.selectedExpert.name }}</span>
              </div>
              <div class="toolbar-spacer"></div>
              <button class="toolbar-btn">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
              <!-- 发送/停止按钮 -->
              <button
                v-if="!isStreaming"
                class="send-btn"
                :class="{ 'send-btn--active': taskInput.trim() }"
                @click="sendMessage"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
              <button v-else class="send-btn send-btn--stop" @click="agentStore.cancelMessage()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
              <!-- Plus Menu -->
              <Transition name="plus-menu-slide">
                <PlusMenu
                  v-if="showInputPlusMenu"
                  compact
                  @mouseenter="plusMenuHover.cancelClose"
                  @mouseleave="plusMenuHover.closeNow"
                  @select-skill="onSelectSkillToken"
                  @select-files="onSelectFiles"
                  @close="showInputPlusMenu = false"
                  @navigate="onPlusNavigate"
                />
              </Transition>
            </div>
          </div>
        </div>
        <!-- 分享二维码模态框 -->
        <Transition name="dropdown">
          <div v-if="qrModalOpen" class="qr-modal-mask" @click.self="closeQrModal">
            <div class="qr-modal">
              <button class="qr-modal-close" title="关闭" @click="closeQrModal">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <p class="qr-modal-title">扫码打开分享链接</p>
              <div class="qr-modal-body">
                <img v-if="qrDataUrl" :src="qrDataUrl" alt="分享二维码" class="qr-modal-img" />
                <div v-else class="qr-modal-loading">二维码生成中…</div>
              </div>
              <p class="qr-modal-link">{{ shareLink }}</p>
            </div>
          </div>
        </Transition>
      </div>
      <ChatSidePanel v-model:fullscreen="panelFullscreen" />
    </div>
    <!-- Toast（页面级共享：位于 welcome-area / chat-area 两个互斥分支之外，
         欢迎态与对话态均需渲染——文件校验反馈（不支持类型/文件过大等）两种状态都不可缺失） -->
    <Transition name="dropdown">
      <div v-if="toast" class="chat-toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   New Task Page
   ═══════════════════════════════════════════════════════════════════════════ */
.new-task-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* Welcome area */
.welcome-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 32px 40px;
  overflow-y: auto;
}

.welcome-heading {
  font-size: 28px;
  font-weight: 700;
  color: #1a2332;
  margin: 0 0 20px;
  text-align: center;
}

.welcome-highlight {
  color: #0891b2;
}

/* Category pills */
.category-pills {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
}

.category-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 999px;
  background: #f0f6fa;
  color: #4b5563;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.category-pill:hover {
  background: rgba(8, 145, 178, 0.1);
}

.category-pill--active {
  background: #1a2332;
  color: #ffffff;
  box-shadow: 0 2px 10px rgba(26, 35, 50, 0.25);
}

/* Chips row */
.chips-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 720px;
  margin-bottom: -10px;
}

.chips-scroll-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.chips-scroll-btn:hover {
  background: rgba(8, 145, 178, 0.08);
  color: #6b7f95;
}

.chips-scroll {
  flex: 1;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.chips-scroll::-webkit-scrollbar {
  display: none;
}

.quick-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(8, 145, 178, 0.12);
  border-radius: 12px;
  background: #f5f9fb;
  color: #374151;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.quick-chip:hover {
  background: rgba(8, 145, 178, 0.07);
  color: #0891b2;
}

.chip-icon {
  display: flex;
  align-items: center;
  color: #0891b2;
}

.mascot {
  flex-shrink: 0;
  margin-left: 4px;
}

/* Input card */
.input-card {
  position: relative;
  width: 100%;
  max-width: 720px;
  border-radius: 16px;
  border: 1.5px solid rgba(8, 145, 178, 0.2);
  box-shadow: 0 4px 24px rgba(8, 145, 178, 0.08);
  background: #ffffff;
}

.task-textarea {
  width: 100%;
  padding: 16px 16px 8px;
  border: none;
  background: transparent;
  outline: none;
  resize: none;
  font-size: 14px;
  font-family: inherit;
  color: #1e293b;
  box-sizing: border-box;
  min-height: 84px;
  line-height: 1.6;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 拖拽文件悬停输入框：虚线高亮提示可放置 */
.task-textarea--dragging {
  outline: 2px dashed #0891b2;
  outline-offset: -2px;
  border-radius: 8px;
  background: rgba(8, 145, 178, 0.05);
}

.task-textarea:empty::before {
  content: attr(data-placeholder);
  color: #9ca3af;
  pointer-events: none;
}

.task-textarea--compact {
  padding: 12px 12px 4px;
  min-height: 60px;
}

/* Input toolbar */
.input-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px 12px;
}

.input-toolbar--compact {
  padding: 0 8px 10px;
}

.toolbar-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* AI 改写润色：请求中转圈 */
.toolbar-btn--polishing svg {
  animation: polish-spin 0.8s linear infinite;
}

@keyframes polish-spin {
  to {
    transform: rotate(360deg);
  }
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.toolbar-btn:hover {
  background: rgba(8, 145, 178, 0.08);
  color: #6b7f95;
}

.toolbar-spacer {
  flex: 1;
}

/* Model selector */
.model-selector {
  position: relative;
}

.model-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6b7f95;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.model-btn:hover {
  background: rgba(8, 145, 178, 0.08);
}

.model-btn svg:first-child {
  color: #0891b2;
}

.model-dropdown {
  position: absolute;
  bottom: calc(100% + 4px);
  right: 0;
  min-width: 160px;
  max-height: 320px;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid rgba(8, 145, 178, 0.15);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 20;
}

.model-group-label {
  padding: 6px 12px 2px;
  font-size: 10px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.model-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-family: inherit;
  color: #374151;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.1s ease;
}

.model-option:hover {
  background: rgba(8, 145, 178, 0.06);
}

.model-option--active {
  color: #0891b2;
  font-weight: 600;
}

.model-option-gap {
  width: 10px;
}

/* Send button */
.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: #e5e7eb;
  color: #9ca3af;
  cursor: pointer;
  transition:
    transform 0.1s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.send-btn--active {
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(8, 145, 178, 0.35);
}

.send-btn:active {
  transform: scale(0.9);
}

.send-btn--stop {
  background: #ef4444;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35);
}

.send-btn--stop:hover {
  background: #dc2626;
}

/* Input footer */
.input-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 10px;
  border-top: 1px solid rgba(8, 145, 178, 0.08);
}

.footer-action {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6b7f95;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.footer-action:hover {
  background: rgba(8, 145, 178, 0.06);
}

/* Selection chips（输入卡左上角：模式/技能/文件） */
.selection-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 4px;
}

.selection-chips--compact {
  padding: 0 12px 2px;
}

.selection-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid rgba(8, 145, 178, 0.18);
  border-radius: 999px;
  background: rgba(8, 145, 178, 0.06);
  color: #0e7490;
  font-size: 11px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.selection-chip:hover {
  background: rgba(8, 145, 178, 0.12);
}

.selection-chip-del {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.selection-chip:hover .selection-chip-del {
  opacity: 1;
}

.selection-chip-name {
  white-space: nowrap;
}

/* Expert chip（工具栏 + 号右侧，hover 头像变删除图标） */
.expert-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: 999px;
  background: rgba(139, 92, 246, 0.08);
  color: #7c3aed;
  font-size: 11px;
  cursor: pointer;
  max-width: 160px;
  transition: background-color 0.15s ease;
}

.expert-chip:hover {
  background: rgba(139, 92, 246, 0.14);
}

.expert-chip-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 专家头像：渐变圆 + 悬停变删除图标 */
.expert-chip-avatar {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 8px;
  font-weight: 700;
  flex-shrink: 0;
}

.expert-chip-avatar-text {
  transition: opacity 0.15s ease;
}

.expert-chip-avatar-del {
  position: absolute;
  inset: 0;
  margin: auto;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.expert-chip:hover .expert-chip-avatar-text {
  opacity: 0;
}

.expert-chip:hover .expert-chip-avatar-del {
  opacity: 1;
}

/* 技能 token（contenteditable 输入框内：图标 + 名称，hover 图标变删除）
   注意：token 由 createElement 动态创建，无 scoped data-v 属性，选择器必须用 :deep() */
:deep(.skill-token) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  margin: 0 1px;
  border: 1px solid rgba(8, 145, 178, 0.18);
  border-radius: 999px;
  background: rgba(8, 145, 178, 0.06);
  cursor: pointer;
  vertical-align: middle;
  white-space: nowrap;
}

:deep(.skill-token-icon) {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

:deep(.skill-token-icon svg) {
  transition: opacity 0.15s ease;
}

:deep(.skill-token-del) {
  position: absolute;
  inset: 0;
  margin: auto;
  opacity: 0;
}

:deep(.skill-token:hover .skill-token-icon svg:first-child) {
  opacity: 0;
}

:deep(.skill-token:hover .skill-token-del) {
  opacity: 1;
}

:deep(.skill-token-name) {
  font-size: 12px;
  color: #0e7490;
  white-space: nowrap;
}

/* 文件 token（contenteditable 输入框内：图标 + 文件名，hover 图标变删除，title 提示绝对路径）
   注意：token 由 createElement 动态创建，无 scoped data-v 属性，选择器必须用 :deep() */
:deep(.file-token) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  margin: 0 1px;
  border: 1px solid rgba(8, 145, 178, 0.18);
  border-radius: 999px;
  background: rgba(8, 145, 178, 0.06);
  cursor: pointer;
  vertical-align: middle;
  white-space: nowrap;
}

:deep(.file-token-icon) {
  position: relative;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #0e7490;
  flex-shrink: 0;
}

:deep(.file-token-icon svg) {
  transition: opacity 0.15s ease;
}

:deep(.file-token-del) {
  position: absolute;
  inset: 0;
  margin: auto;
  opacity: 0;
}

:deep(.file-token:hover .file-token-icon svg:first-child) {
  opacity: 0;
}

:deep(.file-token:hover .file-token-del) {
  opacity: 1;
}

:deep(.file-token-name) {
  font-size: 12px;
  color: #0e7490;
  white-space: nowrap;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Workspace selector */
/* ═══════════════════════════════════════════════════════════════════════════
   权限菜单（默认权限 / 允许完全访问）
   ═══════════════════════════════════════════════════════════════════════════ */
.perm-selector {
  position: relative;
}

.perm-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  width: 300px;
  padding: 12px 14px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow:
    0 -2px 16px rgba(0, 0, 0, 0.1),
    0 4px 20px rgba(0, 0, 0, 0.08);
  z-index: 100;
}

.perm-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: #6b7f95;
}

.perm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.perm-row-label {
  font-size: 13px;
  font-weight: 500;
  color: #1a2332;
}

/* 开关（与 PlusMenu 模式开关同视觉） */
.perm-switch {
  position: relative;
  width: 30px;
  height: 17px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: #e2e8f0;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.perm-switch--on {
  background: linear-gradient(135deg, #0891b2, #0e7490);
}

.perm-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s ease;
}

.perm-switch--on .perm-switch-knob {
  transform: translateX(13px);
}

/* 风险确认弹窗（参照 rename-card 范式） */
.perm-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.perm-confirm-card {
  width: 420px;
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.perm-confirm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  font-size: 15px;
  font-weight: 600;
  color: #1a2332;
}

.perm-confirm-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.perm-confirm-close:hover {
  background: #f3f4f6;
}

.perm-confirm-body {
  padding: 0 20px 12px;
}

.perm-confirm-message {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.7;
  color: #4b5563;
}

.perm-risk {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  font-size: 12px;
  color: #374151;
}

.perm-risk-checkbox {
  accent-color: #0891b2;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.perm-confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px 16px;
}

.perm-confirm-btn {
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    background-color 0.15s ease;
}

.perm-confirm-btn--cancel {
  background: #f3f4f6;
  color: #374151;
}

.perm-confirm-btn--cancel:hover {
  background: #e5e7eb;
}

.perm-confirm-btn--confirm {
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
}

.perm-confirm-btn--confirm:hover {
  opacity: 0.9;
}

.perm-confirm-btn--confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.workspace-selector {
  position: relative;
}

.workspace-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  width: 260px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow:
    0 -2px 16px rgba(0, 0, 0, 0.1),
    0 4px 20px rgba(0, 0, 0, 0.08);
  padding: 6px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ws-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 7px;
  background: rgba(8, 145, 178, 0.06);
  border: 1px solid rgba(8, 145, 178, 0.1);
  color: #9ca3af;
  margin-bottom: 4px;
}

.ws-search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 12px;
  font-family: inherit;
  color: #374151;
  min-width: 0;
}

.ws-search-input::placeholder {
  color: #9ca3af;
}

.ws-list {
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ws-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 7px;
  color: #1e293b;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease;
}

.ws-item:hover {
  background: #f1f5f9;
}

.ws-item-icon {
  flex-shrink: 0;
  color: #64748b;
}

.ws-item-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-item-check {
  flex-shrink: 0;
  color: #0891b2;
}

.ws-empty {
  margin: 0;
  padding: 10px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}

.ws-divider {
  margin: 4px 6px;
  border-top: 1px solid #eef2f7;
}

/* 新建工作空间 Modal */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal-card {
  width: 360px;
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  font-size: 15px;
  font-weight: 600;
  color: #1a2332;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.modal-close:hover {
  background: #f3f4f6;
}

.modal-body {
  padding: 0 20px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-label {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}

.modal-input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border: 1px solid #d1d9e6;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  color: #1a2332;
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.modal-input:focus {
  border-color: #0891b2;
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.12);
}

.modal-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #ef4444;
}

.modal-hint {
  margin: 0;
  font-size: 11px;
  color: #94a3b8;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px 16px;
}

.modal-btn {
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    background-color 0.15s ease;
}

.modal-btn--cancel {
  background: #f3f4f6;
  color: #374151;
}

.modal-btn--cancel:hover {
  background: #e5e7eb;
}

.modal-btn--confirm {
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
}

.modal-btn--confirm:hover {
  opacity: 0.9;
}

.modal-btn--confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Plus-menu transition */
.plus-menu-slide-enter-active {
  transition: all 0.2s ease-out;
}

.plus-menu-slide-leave-active {
  transition: all 0.15s ease-in;
}

.plus-menu-slide-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}

.plus-menu-slide-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.97);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Chat State
   ═══════════════════════════════════════════════════════════════════════════ */
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

/* 左侧对话+输入列（全屏右侧栏时隐藏） */
.chat-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  /* 全宽滚动容器：滚动条贴右缘（右栏分割线），内容保持 760px 居中列（窄窗钳制 32px 留白） */
  padding: 48px max(32px, calc((100% - 760px) / 2)) 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* 细窄滚动条：内容不溢出时不显示，溢出时出现在消息区最右缘（分割线旁） */
  scrollbar-width: thin;
  scrollbar-color: rgba(8, 145, 178, 0.28) transparent;
  width: 100%;
}

.chat-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(8, 145, 178, 0.28);
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: rgba(8, 145, 178, 0.45);
}

/* 消息区浮动跳转按钮（与 760px 消息列右缘对齐；悬于输入栏上方） */
.chat-scroll-jump {
  position: absolute;
  right: max(8px, calc(50% - 380px));
  bottom: 132px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid rgba(8, 145, 178, 0.2);
  border-radius: 50%;
  background: #ffffff;
  color: #0e7490;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12);
  z-index: 10;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.chat-scroll-jump:hover {
  background: rgba(8, 145, 178, 0.08);
  color: #0891b2;
  box-shadow: 0 2px 12px rgba(8, 145, 178, 0.25);
}

.chat-bubble-row {
  position: relative;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  border-radius: 10px;
  transition: background-color 0.15s ease;
}

/* 搜索高亮：命中行淡黄、当前定位行深黄 */
.chat-msg--hit {
  background: #fffbe6;
}

.chat-msg--current {
  background: #fef3c7;
}

/* 分享选择模式：选中消息行高亮 */
.chat-msg-row--selected {
  background: rgba(8, 145, 178, 0.06);
}

/* 分享选择模式：行内出现复选框时左侧让位（:has 兼容 Electron 39 / Chromium 高版本） */
.chat-bubble-row:has(.chat-msg-check) {
  padding-left: 26px;
}

/* 消息行复选框（分享选择模式下显示，位于每条消息最左侧） */
.chat-msg-check {
  position: absolute;
  left: 0;
  top: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  cursor: pointer;
  z-index: 2;
}

.chat-msg-check input {
  display: none;
}

.chat-msg-check-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid #cbd5e1;
  background: #ffffff;
  box-sizing: border-box;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.chat-msg-check:hover .chat-msg-check-box {
  border-color: #0891b2;
}

.chat-msg-check--selected .chat-msg-check-box {
  background: #0891b2;
  border-color: #0891b2;
}

.chat-bubble-row--user {
  justify-content: flex-end;
}

/* AI 回复行纵向化：头部（头像+名字）在上，正文中，操作栏在下 */
.chat-bubble-row--assistant {
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
}

/* AI 头像：顶部头部行内的小尺寸 */
.chat-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.chat-avatar--sm {
  width: 20px;
  height: 20px;
  margin-top: 0;
}

.chat-avatar--ai {
  background: linear-gradient(135deg, #0891b2, #0e7490);
}

/* AI 消息头部行：头像 + "KeWork" 文字 */
.chat-bubble-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.chat-bubble-head-name {
  font-size: 13px;
  font-weight: 600;
  color: #1a2332;
}

/* 正文：无背景色（接近左侧白底） */
.chat-bubble {
  padding: 0;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.6;
  background: transparent;
  color: #1a2332;
}

/* 用户消息：浅灰背景 */
.chat-bubble--user {
  background: #f3f4f6;
  color: #1a2332;
  border-radius: 18px;
  border-bottom-right-radius: 4px;
  padding: 12px 16px;
}

/* Chat bubble wrapper (for reasoning + content layout) */
.chat-bubble-wrapper {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* 思考消息与正式消息的间隔 */
  gap: 16px;
}

.chat-bubble-wrapper--user {
  align-items: flex-end;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Thinking / Reasoning Block (深度思考)
   ═══════════════════════════════════════════════════════════════════════════ */
.thinking-block {
  border-radius: 14px 14px 4px 4px;
  background: rgba(8, 145, 178, 0.04);
  border: 1px solid rgba(8, 145, 178, 0.12);
  border-left: 3px solid #0891b2;
  overflow: hidden;
}

.thinking-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: #0891b2;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}

.thinking-header:hover {
  background: rgba(8, 145, 178, 0.06);
}

.thinking-header-text {
  flex: 1;
  text-align: left;
}

.thinking-chevron {
  flex-shrink: 0;
  color: #0891b2;
  transition: transform 0.2s ease;
}

.thinking-chevron--collapsed {
  transform: rotate(-90deg);
}

.thinking-body {
  padding: 6px 14px 10px;
  font-size: 13px;
  line-height: 1.6;
  /* 思考消息：淡灰文字，hover 变深灰 */
  color: #9ca3af;
  border-top: 1px solid rgba(8, 145, 178, 0.06);
  transition: color 0.15s ease;
}

.thinking-block:hover .thinking-body {
  color: #6b7280;
}

/* 思考块内嵌元素颜色统一为淡灰（保留 code/pre 原配色保证可读性） */
.thinking-body :deep(.message-content--rich p),
.thinking-body :deep(.message-content--rich li),
.thinking-body :deep(.message-content--rich strong),
.thinking-body :deep(.message-content--rich td),
.thinking-body :deep(.message-content--rich h1),
.thinking-body :deep(.message-content--rich h2),
.thinking-body :deep(.message-content--rich h3),
.thinking-body :deep(.message-content--rich h4) {
  color: inherit;
}

/* Thinking collapse transition */
.thinking-collapse-enter-active,
.thinking-collapse-leave-active {
  transition:
    opacity 0.2s ease,
    max-height 0.25s ease;
  overflow: hidden;
}

.thinking-collapse-enter-from,
.thinking-collapse-leave-to {
  opacity: 0;
  max-height: 0;
}

/* Thinking bubble (loading dots) */
.thinking-bubble {
  display: flex;
  align-items: center;
  gap: 4px;
  /* 基类 padding 已归零，加载气泡自持外观 */
  padding: 12px 16px;
  background: #f5f9fb;
  border-radius: 18px 18px 18px 4px;
}

.dot-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #0891b2;
  animation: dotBounce 0.6s ease-in-out infinite;
}

@keyframes dotBounce {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-4px);
  }
}

/* Chat input bar */
/* ═══════════════════════════════════════════════════════════════════════════
   Chat Header（会话标题栏）
   ═══════════════════════════════════════════════════════════════════════════ */
.chat-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 24px;
  border-bottom: 1px solid rgba(8, 145, 178, 0.08);
  background: #ffffff;
  flex-shrink: 0;
}

.chat-header-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1a2332;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.chat-header-btn-wrap {
  position: relative;
  display: flex;
}

.chat-header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.chat-header-btn:hover,
.chat-header-btn--active {
  background: rgba(8, 145, 178, 0.1);
  color: #0891b2;
}

/* 历史提问下拉 */
.history-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 320px;
  max-height: 360px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  border: 1px solid rgba(8, 145, 178, 0.14);
  z-index: 30;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-menu-title {
  margin: 0;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7f95;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.history-menu-list {
  overflow-y: auto;
  padding: 4px;
}

.history-menu-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease;
}

.history-menu-item:hover {
  background: rgba(8, 145, 178, 0.06);
}

.history-menu-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #374151;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.history-menu-time {
  font-size: 11px;
  color: #9ca3af;
  flex-shrink: 0;
  padding-top: 2px;
}

.history-menu-empty {
  margin: 0;
  padding: 16px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}

/* 对话内搜索条：header 内浮层，出现在"对话内搜索"图标左侧
   （right 相对 header padding box：3 个按钮 × 30px + 2 个间距 × 2px + 右侧 padding 24px + 6px 留白） */
.chat-search-bar {
  position: absolute;
  top: 50%;
  right: calc(30px * 3 + 2px * 2 + 24px + 6px);
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  width: 320px;
  padding: 6px 10px;
  border: 1px solid rgba(8, 145, 178, 0.18);
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1);
  z-index: 30;
  color: #9ca3af;
}

.chat-search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  font-family: inherit;
  color: #1a2332;
  min-width: 0;
}

.chat-search-input::placeholder {
  color: #9ca3af;
}

.chat-search-count {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
}

.chat-search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.chat-search-btn:hover:not(:disabled) {
  background: rgba(8, 145, 178, 0.1);
  color: #0891b2;
}

.chat-search-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 搜索条浮层过渡：仅淡入淡出（浮层本身有 translateY(-50%) 定位，不做位移过渡） */
.searchbar-enter-active,
.searchbar-leave-active {
  transition: opacity 0.15s ease;
}

.searchbar-enter-from,
.searchbar-leave-to {
  opacity: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Share Panel（底部分享面板）
   ═══════════════════════════════════════════════════════════════════════════ */
.share-panel {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  max-width: 760px;
  margin: 0 auto 12px;
  padding: 10px 14px;
  border: 1px solid rgba(8, 145, 178, 0.18);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
  flex-shrink: 0;
}

.share-select-all {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.share-select-all:hover {
  background: rgba(8, 145, 178, 0.06);
}

.share-select-all input {
  display: none;
}

.share-select-all-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid #cbd5e1;
  background: #ffffff;
  box-sizing: border-box;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.share-select-all-box--indeterminate {
  border-color: #0891b2;
}

.share-select-all-line {
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: #0891b2;
}

.share-select-all-text {
  font-size: 12px;
  color: #374151;
  white-space: nowrap;
}

.share-panel-divider {
  width: 1px;
  height: 20px;
  background: #e5e7eb;
  margin: 0 6px;
  flex-shrink: 0;
}

.share-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.share-action:hover {
  background: rgba(8, 145, 178, 0.08);
}

.share-action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #ffffff;
}

.share-action-icon--wechat {
  background: #10b981;
}

.share-action-icon--moments {
  background: #059669;
}

.share-action-icon--link {
  background: #0891b2;
}

.share-action-icon--qr {
  background: #7c3aed;
}

.share-action-icon--browser {
  background: #6366f1;
}

.share-action-text {
  font-size: 11px;
  color: #374151;
  white-space: nowrap;
}

.share-panel-spacer {
  flex: 1;
}

.share-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: #f3f4f6;
  color: #6b7280;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.share-close:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* 分享面板过渡 */
.share-panel-enter-active,
.share-panel-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.share-panel-enter-from,
.share-panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Share QR Modal（分享二维码模态框）
   ═══════════════════════════════════════════════════════════════════════════ */
.qr-modal-mask {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.qr-modal {
  position: relative;
  width: 300px;
  padding: 20px;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.qr-modal-close {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: #f3f4f6;
  color: #6b7280;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.qr-modal-close:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.qr-modal-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1a2332;
}

.qr-modal-body {
  width: 240px;
  height: 240px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.qr-modal-img {
  width: 240px;
  height: 240px;
  display: block;
}

.qr-modal-loading {
  font-size: 12px;
  color: #9ca3af;
}

.qr-modal-link {
  margin: 0;
  max-width: 260px;
  font-size: 11px;
  color: #6b7f95;
  word-break: break-all;
  text-align: center;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Chat Message Actions（AI 回复操作栏）
   ═══════════════════════════════════════════════════════════════════════════ */
.chat-msg-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}

.chat-msg-action-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.chat-msg-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.chat-msg-action-btn:hover:not(:disabled) {
  background: rgba(8, 145, 178, 0.1);
  color: #0e7490;
}

.chat-msg-action-btn--active {
  color: #0891b2;
}

.chat-msg-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chat-msg-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  font-size: 11px;
  color: #9ca3af;
  flex-shrink: 0;
}

.chat-msg-meta-item--strong {
  color: #6b7280;
}

/* Toast */
.chat-toast {
  position: absolute;
  left: 50%;
  bottom: 96px;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.85);
  color: #ffffff;
  font-size: 12px;
  z-index: 150;
  pointer-events: none;
  white-space: nowrap;
}

.chat-input-bar {
  /* 与对话区同宽居中（max-width 与 margin auto 必须同写） */
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 0 0 24px;
}

.chat-input-card {
  position: relative;
  border-radius: 16px;
  border: 1.5px solid rgba(8, 145, 178, 0.2);
  box-shadow: 0 2px 12px rgba(8, 145, 178, 0.06);
  background: #ffffff;
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Responsive
   ═══════════════════════════════════════════════════════════════════════════ */
@media (max-width: 768px) {
  .welcome-area {
    padding: 40px 20px 32px;
  }

  .welcome-heading {
    font-size: 24px;
  }

  .mascot {
    display: none;
  }

  .chat-messages {
    padding: 40px 20px 12px;
  }

  .chat-input-bar {
    padding: 0 0 16px;
  }
}

@media (max-width: 440px) {
  .category-pills {
    flex-wrap: wrap;
    justify-content: center;
  }

  .chips-row {
    gap: 4px;
  }

  .input-toolbar {
    padding: 0 8px 10px;
  }
}
</style>
