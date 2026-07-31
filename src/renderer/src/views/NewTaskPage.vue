<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAgentStore } from '../store/agent'
import MessageContent from '../components/MessageContent.vue'

const agentStore = useAgentStore()

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
const bottomRef = ref<HTMLElement | null>(null)

// ── Computed ──
const messages = computed(() => {
  const msgs = currentMessages.value.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
    reasoning: m.reasoning
  }))
  console.log('[NewTaskPage] messages computed, count:', msgs.length, 'roles:', msgs.map(m => m.role))
  return msgs
})
const thinking = computed(() => {
  const val = isStreaming.value || isThinking.value
  console.log('[NewTaskPage] thinking computed:', val)
  return val
})

// 思考块折叠状态：记录每个消息 index 的折叠状态
const thinkingCollapsed = ref<Record<number, boolean>>({})

const toggleThinking = (index: number): void => {
  thinkingCollapsed.value[index] = !thinkingCollapsed.value[index]
}

const isLastAssistant = (index: number): boolean => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === 'assistant') {
      return i === index
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
  agentStore.sendMessage(content).catch((err: unknown) => {
    console.error('[NewTaskPage] sendMessage failed:', err)
    // 失败时恢复输入内容，避免用户输入丢失且无反馈
    taskInput.value = content
  })
}

// ── Close plus menu on outside click ──
const handleDocumentClick = (e: MouseEvent): void => {
  const target = e.target as HTMLElement
  if (!target.closest('[data-plus-menu-trigger]') && !target.closest('.plus-menu')) {
    showInputPlusMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentClick)
})

// 消息更新时自动滚动到底部
watch(
  () => [currentMessages.value.length, isStreaming.value],
  () => {
    nextTick(() => bottomRef.value?.scrollIntoView({ behavior: 'smooth' }))
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
        <button v-for="cat in categories" :key="cat.key"
          :class="['category-pill', { 'category-pill--active': category === cat.key }]"
          @click="category = cat.key">
          <span>{{ cat.icon }}</span>
          {{ cat.label }}
        </button>
      </div>

      <!-- Quick chips + mascot -->
      <div class="chips-row">
        <button class="chips-scroll-btn chips-scroll-btn--left" @click="scrollChips('left')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div ref="chipsScrollRef" class="chips-scroll">
          <button v-for="chip in quickChips" :key="chip.label" class="quick-chip">
            <span class="chip-icon">
              <svg v-if="chip.icon === 'doc'" width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <svg v-else-if="chip.icon === 'chart'" width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <svg v-else-if="chip.icon === 'research'" width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <svg v-else-if="chip.icon === 'video'" width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
              <svg v-else-if="chip.icon === 'slides'" width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </span>
            {{ chip.label }}
          </button>
        </div>
        <button class="chips-scroll-btn chips-scroll-btn--right" @click="scrollChips('right')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
          <rect x="27" y="23" width="14" height="12" rx="6" fill="none" stroke="url(#rmg2)" stroke-width="1.5" />
          <rect x="47" y="23" width="14" height="12" rx="6" fill="none" stroke="url(#rmg2)" stroke-width="1.5" />
          <ellipse cx="44" cy="37" rx="3" ry="1.5" fill="#94a3b8" />
          <path d="M40 40 Q44 43 48 40" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" fill="none" />
          <path d="M16 27 Q14 20 20 16" stroke="#0891b2" stroke-width="3" stroke-linecap="round" fill="none" />
          <rect x="12" y="26" width="8" height="10" rx="4" fill="url(#rmg2)" />
          <path d="M72 27 Q74 20 68 16" stroke="#0891b2" stroke-width="3" stroke-linecap="round" fill="none" />
          <rect x="68" y="26" width="8" height="10" rx="4" fill="url(#rmg2)" />
          <rect x="10" y="48" width="14" height="18" rx="7" fill="url(#rmg1)" />
          <rect x="64" y="48" width="14" height="18" rx="7" fill="url(#rmg1)" />
          <rect x="28" y="70" width="12" height="8" rx="4" fill="#cbd5e1" />
          <rect x="48" y="70" width="12" height="8" rx="4" fill="#cbd5e1" />
        </svg>
      </div>

      <!-- Input card -->
      <div class="input-card">
        <textarea v-model="taskInput" class="task-textarea" placeholder="今天帮你做些什么？  @ 引用对话文件，/ 调用技能与指令" rows="3"
          @keydown.enter.exact.prevent="sendMessage"></textarea>
        <div class="input-toolbar">
          <button class="toolbar-btn" data-plus-menu-trigger @click="showInputPlusMenu = !showInputPlusMenu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
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
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {{ model }}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <Transition name="dropdown">
              <div v-if="modelOpen" class="model-dropdown">
                <button v-for="opt in modelOptions" :key="opt"
                  :class="['model-option', { 'model-option--active': model === opt }]" @click="selectModel(opt)">
                  <svg v-if="model === opt" width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span v-else class="model-option-gap"></span>
                  {{ opt }}
                </button>
              </div>
            </Transition>
          </div>
          <button class="toolbar-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          <!-- 发送/停止按钮 -->
          <button v-if="!isStreaming" class="send-btn" :class="{ 'send-btn--active': taskInput.trim() }" @click="sendMessage">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
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
            <div v-if="showInputPlusMenu" class="plus-menu">
              <button class="plus-menu-item" @click="showInputPlusMenu = false">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span>添加文件</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  class="plus-menu-chevron">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <button class="plus-menu-item" @click="showInputPlusMenu = false">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span>模式</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  class="plus-menu-chevron">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <button class="plus-menu-item" @click="showInputPlusMenu = false">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2">
                  <polygon
                    points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>专家</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  class="plus-menu-chevron">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <button class="plus-menu-item" @click="showInputPlusMenu = false">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2">
                  <circle cx="12" cy="12" r="3" />
                  <path
                    d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>技能</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  class="plus-menu-chevron">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <button class="plus-menu-item" @click="showInputPlusMenu = false">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                <span>连接器</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  class="plus-menu-chevron">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </Transition>
        </div>

        <div class="input-footer">
          <button class="footer-action">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            选择工作空间
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button class="footer-action">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            默认权限
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Chat state -->
    <div v-else class="chat-area">
      <div class="chat-messages">
        <div v-for="(msg, i) in messages" :key="i"
          :class="['chat-bubble-row', { 'chat-bubble-row--user': msg.role === 'user' }]">
          <div v-if="msg.role === 'assistant'" class="chat-avatar chat-avatar--ai">
            <svg width="20" height="20" viewBox="0 0 64 64" fill="none">
              <ellipse cx="32" cy="38" rx="12" ry="14" fill="#0891b2" />
              <circle cx="32" cy="20" r="9" fill="#0891b2" />
              <circle cx="29" cy="19" r="2.5" fill="white" />
              <circle cx="29.5" cy="19" r="1.2" fill="#0e7490" />
            </svg>
          </div>
          <div class="chat-bubble-wrapper">
            <!-- 深度思考块 -->
            <div v-if="msg.reasoning" class="thinking-block">
              <button class="thinking-header" @click="toggleThinking(i)">
                <span class="thinking-header-text">深度思考</span>
                <svg
                  :class="['thinking-chevron', { 'thinking-chevron--collapsed': thinkingCollapsed[i] }]"
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <Transition name="thinking-collapse">
                <div v-show="!thinkingCollapsed[i]" class="thinking-body">
                  <MessageContent :content="msg.reasoning" content-type="markdown" />
                </div>
              </Transition>
            </div>
            <!-- 消息内容：有内容时渲染，空内容+流式输出时显示加载动画 -->
            <div v-if="msg.content" :class="['chat-bubble', { 'chat-bubble--user': msg.role === 'user' }]">
              <MessageContent :content="msg.content" content-type="markdown" />
            </div>
            <div v-else-if="isLastAssistant(i) && thinking" class="chat-bubble thinking-bubble">
              <span class="dot-pulse" style="animation-delay: 0s"></span>
              <span class="dot-pulse" style="animation-delay: 0.15s"></span>
              <span class="dot-pulse" style="animation-delay: 0.3s"></span>
            </div>
          </div>
          <div v-if="msg.role === 'user'" class="chat-avatar chat-avatar--user">鸾</div>
        </div>
        <div ref="bottomRef"></div>
      </div>
      <!-- Compact input -->
      <div class="chat-input-bar">
        <div class="chat-input-card">
          <textarea v-model="taskInput" class="task-textarea task-textarea--compact" placeholder="继续输入…" rows="2"
            @keydown.enter.exact.prevent="sendMessage"></textarea>
          <div class="input-toolbar input-toolbar--compact">
            <button class="toolbar-btn" data-plus-menu-trigger @click="showInputPlusMenu = !showInputPlusMenu">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <div class="toolbar-spacer"></div>
            <button class="toolbar-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
            <!-- 发送/停止按钮 -->
            <button v-if="!isStreaming" class="send-btn" :class="{ 'send-btn--active': taskInput.trim() }" @click="sendMessage">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.5">
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
              <div v-if="showInputPlusMenu" class="plus-menu plus-menu--compact">
                <button class="plus-menu-item" @click="showInputPlusMenu = false">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>添加文件</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" class="plus-menu-chevron">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <button class="plus-menu-item" @click="showInputPlusMenu = false">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>模式</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" class="plus-menu-chevron">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <button class="plus-menu-item" @click="showInputPlusMenu = false">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2">
                    <polygon
                      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <span>专家</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" class="plus-menu-chevron">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <button class="plus-menu-item" @click="showInputPlusMenu = false">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2">
                    <circle cx="12" cy="12" r="3" />
                    <path
                      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>技能</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" class="plus-menu-chevron">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <button class="plus-menu-item" @click="showInputPlusMenu = false">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  <span>连接器</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" class="plus-menu-chevron">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </div>
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

/* Plus Menu */
.plus-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 -2px 16px rgba(0, 0, 0, 0.10), 0 4px 20px rgba(0, 0, 0, 0.08);
  padding: 4px;
  min-width: 180px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.plus-menu--compact {
  left: 0;
  bottom: calc(100% + 2px);
}

.plus-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  background: transparent;
  border-radius: 7px;
  color: #1e293b;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.plus-menu-item:hover {
  background: #f1f5f9;
}

.plus-menu-item svg:first-child {
  flex-shrink: 0;
  color: #64748b;
}

.plus-menu-item span {
  flex: 1;
  text-align: left;
}

.plus-menu-chevron {
  flex-shrink: 0;
  color: #94a3b8;
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
  flex-direction: column;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 48px 32px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scrollbar-width: none;
}

.chat-messages::-webkit-scrollbar {
  display: none;
}

.chat-bubble-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.chat-bubble-row--user {
  justify-content: flex-end;
}

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

.chat-avatar--ai {
  background: linear-gradient(135deg, #0891b2, #0e7490);
}

.chat-avatar--user {
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}

.chat-bubble {
  padding: 12px 16px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.6;
  background: #f5f9fb;
  color: #1a2332;
  border-bottom-left-radius: 4px;
}

.chat-bubble--user {
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
  border-radius: 18px;
  border-bottom-right-radius: 4px;
}

/* Chat bubble wrapper (for reasoning + content layout) */
.chat-bubble-wrapper {
  max-width: 70%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
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
  color: #4b5563;
  border-top: 1px solid rgba(8, 145, 178, 0.06);
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
  padding: 12px 16px;
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
.chat-input-bar {
  padding: 0 32px 24px;
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
    padding: 0 20px 16px;
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
