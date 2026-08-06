<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAgentStore } from '@store/agent'
import { useWorkspaceStore } from '@store/workspace'
import MessageContent from '@components/MessageContent.vue'
import ChatSidePanel from '@components/ChatSidePanel.vue'
import PlusMenu from '@components/PlusMenu.vue'
import { useCatalogStore, type Mode } from '@store/catalog'

const agentStore = useAgentStore()
const workspaceStore = useWorkspaceStore()
const catalog = useCatalogStore()
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
  kind: 'mode' | 'skill' | 'file'
  id?: number
  path?: string
}

/** 输入卡左上角 chips：模式(非默认) + 已选技能 + 已挂载文件（按选择顺序） */
const selectionChips = computed<SelectionChip[]>(() => {
  const chips: SelectionChip[] = []
  if (catalog.mode !== 'default') {
    chips.push({ key: 'mode', label: `模式 · ${MODE_LABELS[catalog.mode]}`, kind: 'mode' })
  }
  for (const s of catalog.selectedSkills) {
    chips.push({ key: `skill-${s.id}`, label: s.name, kind: 'skill', id: s.id })
  }
  for (const f of catalog.attachedFiles) {
    chips.push({ key: `file-${f.path}`, label: f.name, kind: 'file', path: f.path })
  }
  return chips
})

/** 点击 chip 移除对应选择（模式回默认） */
const removeChip = (chip: SelectionChip): void => {
  if (chip.kind === 'mode') catalog.setMode('default')
  else if (chip.kind === 'skill' && chip.id !== undefined) catalog.toggleSkill(chip.id)
  else if (chip.kind === 'file' && chip.path) catalog.removeFile(chip.path)
}

/** 移除专家选择（提示词由 watcher 从输入框移除） */
const removeExpert = (): void => {
  catalog.clearExpert()
}

/** 专家提示词 ↔ textarea 同步（选中插入，移除时剔除原文） */
watch(
  () => catalog.selectedExpertPrompt,
  (prompt, prev) => {
    if (prompt && !taskInput.value.includes(prompt)) {
      taskInput.value = taskInput.value ? `${prompt}\n${taskInput.value}` : prompt
    } else if (!prompt && prev) {
      taskInput.value = taskInput.value.split(prev).join('').replace(/^\n+/, '')
    }
  },
  { immediate: true }
)

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

/** 分享会话：全部消息拼文本复制 */
const shareConversation = (): void => {
  const text = messages.value
    .map((m) => (m.role === 'user' ? `[用户] ${m.content}` : `[AI] ${m.content}`))
    .filter((t) => t.trim().length > 0)
    .join('\n\n')
  if (!text) return
  copyText(text, '会话内容已复制')
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
  agentStore.regenerate({ model: model.value })
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

const modelOptions = ['Auto', 'Qing-Pro', 'Qing-Fast', 'Qing-Research']

// ── Methods ──
const selectModel = (opt: string): void => {
  model.value = opt
  modelOpen.value = false
}

const scrollChips = (dir: 'left' | 'right'): void => {
  const el = chipsScrollRef.value
  if (!el) return
  el.scrollBy({ left: dir === 'right' ? 120 : -120, behavior: 'smooth' })
}

const sendMessage = (): void => {
  if (!taskInput.value.trim()) return
  const content = taskInput.value.trim()
  taskInput.value = ''
  // 用户主动触发的消息动作：即使向上翻阅过也强制回到底部跟随
  atBottom.value = true
  agentStore.sendMessage(content, { model: model.value }).catch((err: unknown) => {
    console.error('[NewTaskPage] sendMessage failed:', err)
    // 失败时恢复输入内容，避免用户输入丢失且无反馈
    taskInput.value = content
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
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentClick)
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
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
        <textarea
          v-model="taskInput"
          class="task-textarea"
          placeholder="今天帮你做些什么？  @ 引用对话文件，/ 调用技能与指令"
          rows="3"
          @keydown.enter.exact.prevent="sendMessage"
        ></textarea>
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
            @click="showInputPlusMenu = !showInputPlusMenu"
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
          <button class="toolbar-btn">
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
            <button class="model-btn" @click="modelOpen = !modelOpen">
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
              <div v-if="modelOpen" class="model-dropdown">
                <button
                  v-for="opt in modelOptions"
                  :key="opt"
                  :class="['model-option', { 'model-option--active': model === opt }]"
                  @click="selectModel(opt)"
                >
                  <svg
                    v-if="model === opt"
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
                  {{ opt }}
                </button>
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
          <button class="footer-action">
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
        </div>
      </div>

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
            <button class="chat-header-btn" title="分享" @click="shareConversation">
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

        <!-- 对话内搜索条 -->
        <Transition name="dropdown">
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
            <input v-model="searchKeyword" class="chat-search-input" placeholder="搜索当前对话" />
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

        <div ref="messagesScrollRef" class="chat-messages" @scroll="updateScrollState">
          <div
            v-for="msg in messages"
            :key="msg.id"
            :data-msg-id="msg.id"
            :class="[
              'chat-bubble-row',
              msg.role === 'user' ? 'chat-bubble-row--user' : 'chat-bubble-row--assistant',
              { 'chat-msg--hit': hitSet.has(msg.id), 'chat-msg--current': currentHitId === msg.id }
            ]"
          >
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
        <!-- Toast -->
        <Transition name="dropdown">
          <div v-if="toast" class="chat-toast">{{ toast }}</div>
        </Transition>
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
        <!-- Compact input -->
        <div class="chat-input-bar">
          <div class="chat-input-card">
            <textarea
              v-model="taskInput"
              class="task-textarea task-textarea--compact"
              placeholder="继续输入…"
              rows="2"
              @keydown.enter.exact.prevent="sendMessage"
            ></textarea>
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
                @click="showInputPlusMenu = !showInputPlusMenu"
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
                <span class="expert-chip-name">{{ catalog.selectedExpert.name }}</span>
                <svg
                  class="expert-chip-del"
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
                  @close="showInputPlusMenu = false"
                  @navigate="onPlusNavigate"
                />
              </Transition>
            </div>
          </div>
        </div>
      </div>
      <ChatSidePanel v-model:fullscreen="panelFullscreen" />
    </div>
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
}

.task-textarea::placeholder {
  color: #9ca3af;
}

.task-textarea--compact {
  padding: 12px 12px 4px;
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
  min-width: 130px;
  background: #ffffff;
  border: 1px solid rgba(8, 145, 178, 0.15);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  z-index: 20;
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

/* Expert chip（工具栏 + 号右侧，hover 显示删除） */
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

/* Workspace selector */
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
  padding: 48px 32px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* 细窄滚动条：内容不溢出时不显示，溢出时出现在消息区最右缘 */
  scrollbar-width: thin;
  scrollbar-color: rgba(8, 145, 178, 0.28) transparent;
  /* 靠中间对齐 + 两侧留白（max-width 与 margin auto 必须同写） */
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
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

/* 对话内搜索条 */
.chat-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px;
  border-bottom: 1px solid rgba(8, 145, 178, 0.08);
  background: #fbfdfe;
  flex-shrink: 0;
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
