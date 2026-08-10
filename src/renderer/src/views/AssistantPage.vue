<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useModelStore } from '@store/models'

// ── Types ──
interface Assistant {
  id: string
  name: string
  desc: string
  tags: string[]
  color: string
  category: string
  featured?: boolean
  deployed?: string
}

interface ChatMessage {
  role: 'user' | 'ai'
  content: string
}

// ── Assistant Data ──
const assistants: Assistant[] = [
  {
    id: 'qingluan',
    name: 'KE-WORK助手',
    desc: '全能 AI 工作助手，支持多场景任务调度与智能对话',
    tags: ['通用', '已部署'],
    color: 'linear-gradient(135deg, #0891b2, #0e7490)',
    category: '通用',
    featured: true,
    deployed: 'GitLab +'
  },
  {
    id: 'code',
    name: '代码专家',
    desc: '深度代码分析、Bug 定位、重构建议与 PR Review',
    tags: ['代码', '技术'],
    color: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    category: '技术'
  },
  {
    id: 'writer',
    name: '写作助手',
    desc: '长文创作、内容优化、风格转换与多语言翻译',
    tags: ['写作', '创意'],
    color: 'linear-gradient(135deg, #f59e0b, #d97706)',
    category: '创意'
  },
  {
    id: 'data',
    name: '数据分析师',
    desc: '数据清洗、可视化方案设计、统计解读与报告生成',
    tags: ['数据', '分析'],
    color: 'linear-gradient(135deg, #10b981, #059669)',
    category: '分析'
  },
  {
    id: 'research',
    name: '深度研究员',
    desc: '行业调研、文献综述、竞品分析与洞察报告',
    tags: ['研究', '报告'],
    color: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    category: '研究'
  },
  {
    id: 'design',
    name: '设计顾问',
    desc: 'UI/UX 评审、设计规范制定、配色方案与组件建议',
    tags: ['设计', 'UX'],
    color: 'linear-gradient(135deg, #ec4899, #db2777)',
    category: '创意'
  },
  {
    id: 'product',
    name: '产品经理',
    desc: '需求梳理、PRD 撰写、路线图规划与用户故事拆解',
    tags: ['产品', '规划'],
    color: 'linear-gradient(135deg, #14b8a6, #0d9488)',
    category: '管理'
  },
  {
    id: 'seo',
    name: 'SEO 顾问',
    desc: '关键词策略、内容优化、外链建设与流量分析',
    tags: ['营销', 'SEO'],
    color: 'linear-gradient(135deg, #f97316, #ea580c)',
    category: '营销'
  },
  {
    id: 'idea',
    name: '创意灵感',
    desc: '头脑风暴、概念生成、创意发散与思维导图',
    tags: ['创意', '灵感'],
    color: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
    category: '创意'
  }
]

const categories = ['全部', '通用', '技术', '分析', '研究', '创意', '管理', '营销']

// ── State ──
const selectedAssistant = ref<Assistant | null>(null)
const activeCategory = ref('全部')
const messages = ref<ChatMessage[]>([])
const input = ref('')
const thinking = ref(false)
const model = ref('Auto')
const modelOpen = ref(false)
const messagesScrollRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// Overview panel accordion state
const overviewOpen = ref(true)
const progressOpen = ref(true)
const outputOpen = ref(true)

// ── Computed ──
const filteredAssistants = computed(() => {
  if (activeCategory.value === '全部') return assistants
  return assistants.filter((a) => a.category === activeCategory.value)
})

/** 内置模型（走默认 agent 配置；自定义模型经 modelStore 追加） */
const BUILTIN_MODELS = ['Auto', 'Qing-Pro', 'Qing-Fast', 'Qing-Research']

const modelStore = useModelStore()

/** 模型下拉分组：内置 + 自定义（自定义模型名可重复，id 唯一，故按 id 传参） */
const modelGroups = computed(() => [
  { name: '内置模型', items: BUILTIN_MODELS.map((name) => ({ name, id: undefined as string | undefined })) },
  { name: '自定义模型', items: modelStore.models.map((m) => ({ name: m.name, id: m.id })) }
])

onMounted(() => {
  // 自定义模型列表（设置页新增后聊天页下拉同步刷新；失败静默保留旧值）
  void modelStore.load()
})

const overviewTasks = [
  '调研跨平台框架与国产OS/鸿蒙技术生态',
  '分析产品需求与技术约束',
  '设计系统架构与技术选型',
  '编写技术实现方案文档'
]

// ── Methods ──
const selectAssistant = (assistant: Assistant): void => {
  selectedAssistant.value = assistant
  messages.value = []
  thinking.value = false
  input.value = ''
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

const backToBrowser = (): void => {
  selectedAssistant.value = null
  messages.value = []
  thinking.value = false
  input.value = ''
}

const selectModel = (opt: { name: string; id?: string }): void => {
  model.value = opt.name
  modelOpen.value = false
}

const sendMessage = (): void => {
  if (!input.value.trim() || !selectedAssistant.value) return
  const txt = input.value.trim()
  input.value = ''
  messages.value.push({ role: 'user', content: txt })
  thinking.value = true
  nextTick(() => {
    messagesScrollRef.value?.scrollTo({
      top: messagesScrollRef.value.scrollHeight,
      behavior: 'smooth'
    })
  })
  setTimeout(() => {
    thinking.value = false
    messages.value.push({
      role: 'ai',
      content: `收到您的问题：「${txt}」\n\n作为 ${selectedAssistant.value!.name}，我正在为您深度分析并整合相关资料……以下是初步回复，如需进一步展开某个方向，请告知。`
    })
    nextTick(() => {
      messagesScrollRef.value?.scrollTo({
        top: messagesScrollRef.value.scrollHeight,
        behavior: 'smooth'
      })
    })
  }, 1400)
}

const handleTextareaKeydown = (e: KeyboardEvent): void => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// Auto-resize textarea
const handleTextareaInput = (): void => {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}
</script>

<template>
  <div class="assistant-page">
    <!-- ═══════════════════════════════════════════ LEFT PANEL ═══════════════════════════════════════════ -->
    <div class="assistant-left">
      <!-- ── Assistant Browser (when no assistant selected) ── -->
      <div v-if="!selectedAssistant" class="assistant-browser">
        <div class="browser-header">
          <h2 class="browser-title">选择助理</h2>
          <p class="browser-subtitle">选择一个 AI 助理开始工作，每个助理都有专属的技能领域</p>
        </div>

        <!-- Category tabs -->
        <div class="category-tabs">
          <button
            v-for="cat in categories"
            :key="cat"
            :class="['category-tab', { 'category-tab--active': activeCategory === cat }]"
            @click="activeCategory = cat"
          >
            {{ cat }}
          </button>
        </div>

        <!-- Assistant cards grid -->
        <div class="assistant-grid">
          <button
            v-for="assistant in filteredAssistants"
            :key="assistant.id"
            class="assistant-card"
            @click="selectAssistant(assistant)"
          >
            <div class="assistant-card-icon" :style="{ background: assistant.color }">
              <!-- Icon placeholder based on assistant name -->
              <svg
                v-if="assistant.id === 'qingluan'"
                width="24"
                height="24"
                viewBox="0 0 64 64"
                fill="none"
              >
                <ellipse cx="32" cy="38" rx="12" ry="14" fill="rgba(255,255,255,0.9)" />
                <circle cx="32" cy="20" r="9" fill="rgba(255,255,255,0.9)" />
              </svg>
              <svg
                v-else-if="assistant.id === 'code'"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                stroke-width="2"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <svg
                v-else-if="assistant.id === 'writer'"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                stroke-width="2"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <svg
                v-else-if="assistant.id === 'data'"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                stroke-width="2"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <svg
                v-else-if="assistant.id === 'research'"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                stroke-width="2"
              >
                <path
                  d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
                />
                <rect x="9" y="3" width="6" height="4" rx="1" />
              </svg>
              <svg
                v-else-if="assistant.id === 'design'"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                stroke-width="2"
              >
                <path
                  d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"
                />
              </svg>
              <svg
                v-else-if="assistant.id === 'product'"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                stroke-width="2"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <svg
                v-else-if="assistant.id === 'seo'"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path
                  d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                />
              </svg>
              <svg
                v-else-if="assistant.id === 'idea'"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                stroke-width="2"
              >
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path
                  d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"
                />
              </svg>
            </div>
            <div class="assistant-card-body">
              <div class="assistant-card-header">
                <span class="assistant-card-name">{{ assistant.name }}</span>
                <span v-if="assistant.tags.includes('已部署')" class="assistant-deploy-badge"
                  >已部署</span
                >
              </div>
              <p class="assistant-card-desc">{{ assistant.desc }}</p>
              <div class="assistant-card-tags">
                <span
                  v-for="tag in assistant.tags.filter((t) => t !== '已部署')"
                  :key="tag"
                  class="assistant-tag"
                >
                  {{ tag }}
                </span>
                <span v-if="assistant.deployed" class="assistant-tag assistant-tag--deploy">
                  {{ assistant.deployed }}
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- ── Assistant Chat Panel (when assistant selected) ── -->
      <div v-else class="assistant-chat">
        <!-- Chat Header -->
        <div class="chat-header">
          <button class="chat-back-btn" title="返回助理列表" @click="backToBrowser">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span class="chat-header-name">{{ selectedAssistant.name }}</span>
          <div class="chat-header-divider"></div>
          <span class="chat-header-connection">已连接：</span>
          <span class="chat-header-wechat">
            <span class="wechat-dot"></span>
            微信小程序
          </span>
          <button class="chat-header-btn" title="设置">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
              />
            </svg>
          </button>
          <div class="chat-header-spacer"></div>
          <button class="chat-header-btn" title="搜索">
            <svg
              width="14"
              height="14"
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
          <button class="chat-header-btn" title="分享">
            <svg
              width="14"
              height="14"
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
          <button class="chat-header-btn" title="展开">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <button class="chat-header-btn" title="窗口">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          </button>
        </div>

        <!-- Messages Area -->
        <div ref="messagesScrollRef" class="chat-messages">
          <div class="chat-messages-inner">
            <!-- Empty state -->
            <div v-if="messages.length === 0 && !thinking" class="chat-empty">
              <div class="chat-empty-icon" :style="{ background: selectedAssistant.color }">
                <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
                  <ellipse cx="32" cy="38" rx="12" ry="14" fill="rgba(255,255,255,0.9)" />
                  <circle cx="32" cy="20" r="9" fill="rgba(255,255,255,0.9)" />
                </svg>
              </div>
              <p class="chat-empty-text">开始与 {{ selectedAssistant.name }} 对话</p>
            </div>

            <!-- Messages -->
            <TransitionGroup name="msg">
              <div
                v-for="(msg, i) in messages"
                :key="i"
                :class="['chat-msg-row', { 'chat-msg-row--user': msg.role === 'user' }]"
              >
                <!-- AI avatar -->
                <div
                  v-if="msg.role === 'ai'"
                  class="chat-avatar chat-avatar--ai"
                  :style="{ background: selectedAssistant.color }"
                >
                  <svg width="14" height="14" viewBox="0 0 64 64" fill="none">
                    <ellipse cx="32" cy="38" rx="12" ry="14" fill="rgba(255,255,255,0.9)" />
                    <circle cx="32" cy="20" r="9" fill="rgba(255,255,255,0.9)" />
                  </svg>
                </div>

                <!-- Bubble -->
                <div class="chat-msg-bubble-wrapper">
                  <div
                    :class="['chat-msg-bubble', { 'chat-msg-bubble--user': msg.role === 'user' }]"
                  >
                    {{ msg.content }}
                  </div>
                  <!-- AI message actions -->
                  <div v-if="msg.role === 'ai'" class="chat-msg-actions">
                    <button class="chat-msg-action-btn" title="复制">
                      <svg
                        width="12"
                        height="12"
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
                    <button class="chat-msg-action-btn" title="点赞">
                      <svg
                        width="12"
                        height="12"
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
                    <button class="chat-msg-action-btn" title="踩">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      >
                        <path
                          d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"
                        />
                      </svg>
                    </button>
                    <button class="chat-msg-action-btn" title="重新生成">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      >
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- User avatar -->
                <div v-if="msg.role === 'user'" class="chat-avatar chat-avatar--user">鸾</div>
              </div>
            </TransitionGroup>

            <!-- Thinking indicator -->
            <div v-if="thinking" class="chat-msg-row">
              <div
                class="chat-avatar chat-avatar--ai"
                :style="{ background: selectedAssistant?.color }"
              >
                <svg width="14" height="14" viewBox="0 0 64 64" fill="none">
                  <ellipse cx="32" cy="38" rx="12" ry="14" fill="rgba(255,255,255,0.9)" />
                  <circle cx="32" cy="20" r="9" fill="rgba(255,255,255,0.9)" />
                </svg>
              </div>
              <div class="chat-thinking-bubble">
                <span class="thinking-dot" style="animation-delay: 0s"></span>
                <span class="thinking-dot" style="animation-delay: 0.15s"></span>
                <span class="thinking-dot" style="animation-delay: 0.3s"></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div class="chat-input-area">
          <div class="chat-input-card">
            <textarea
              ref="textareaRef"
              v-model="input"
              class="chat-input-textarea"
              placeholder="今天帮你做些什么？  @ 引用对话文件，/ 调用技能与指令"
              rows="1"
              @keydown="handleTextareaKeydown"
              @input="handleTextareaInput"
            ></textarea>
            <div class="chat-input-toolbar">
              <!-- Left tools -->
              <button class="chat-toolbar-btn" title="添加">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <button class="chat-toolbar-permission">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
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
                  stroke-linecap="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <button class="chat-toolbar-diamond" title="快捷指令">
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                  <path d="M9 2L13 7H5L9 2Z" fill="#0891b2" opacity="0.75" />
                  <path d="M9 16L13 11H5L9 16Z" fill="#0891b2" opacity="0.95" />
                  <path d="M2 9L7 5V13L2 9Z" fill="#06b6d4" opacity="0.75" />
                  <path d="M16 9L11 5V13L16 9Z" fill="#06b6d4" opacity="0.95" />
                </svg>
              </button>

              <div class="chat-toolbar-spacer"></div>

              <!-- Right tools -->
              <button class="chat-toolbar-btn" title="刷新">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </button>

              <!-- Model selector -->
              <div class="model-selector">
                <button class="model-btn" @click="modelOpen = !modelOpen">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  {{ model }}
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
                <Transition name="dropdown">
                  <div v-if="modelOpen" class="model-dropdown">
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

              <button class="chat-toolbar-btn" title="语音输入">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>

              <button
                :class="['chat-send-btn', { 'chat-send-btn--active': input.trim() }]"
                @click="sendMessage"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════ OVERVIEW PANEL ═══════════════════════════════════════════ -->
    <div class="overview-panel">
      <!-- Panel toolbar -->
      <div class="overview-toolbar">
        <button class="overview-toolbar-btn" title="菜单">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div class="overview-toolbar-spacer"></div>
        <button class="overview-toolbar-btn" title="展开">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
        <button class="overview-toolbar-btn" title="窗口">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        </button>
      </div>

      <!-- Panel content -->
      <div class="overview-content">
        <!-- 概览 accordion -->
        <button class="overview-section-title" @click="overviewOpen = !overviewOpen">
          <span>概览</span>
          <svg
            :class="{ 'overview-chevron--collapsed': !overviewOpen }"
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

        <div v-show="overviewOpen" class="overview-sections">
          <!-- 任务进程 -->
          <div class="overview-subsection">
            <button class="overview-subsection-title" @click="progressOpen = !progressOpen">
              <span>任务进程</span>
              <svg
                :class="{ 'overview-chevron--collapsed': !progressOpen }"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <div v-show="progressOpen" class="overview-task-list">
              <div v-for="(task, idx) in overviewTasks" :key="idx" class="overview-task-item">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  class="overview-task-check"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span class="overview-task-text">{{ task }}</span>
              </div>
            </div>
          </div>

          <!-- 产物 -->
          <div class="overview-subsection">
            <button class="overview-subsection-title" @click="outputOpen = !outputOpen">
              <span>产物</span>
              <svg
                :class="{ 'overview-chevron--collapsed': !outputOpen }"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <div v-show="outputOpen" class="overview-output-item">
              <div class="overview-file-icon">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </div>
              <span class="overview-file-name">AI工作台技术实现方案.html</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   Layout
   ═══════════════════════════════════════════════════════════════════════════ */
.assistant-page {
  display: flex;
  flex: 1;
  height: 100%;
  overflow: hidden;
  font-family:
    'Inter',
    'Noto Sans SC',
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  background: #ffffff;
}

.assistant-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Assistant Browser
   ═══════════════════════════════════════════════════════════════════════════ */
.assistant-browser {
  flex: 1;
  overflow-y: auto;
  padding: 40px 48px 48px;
  scrollbar-width: none;
}

.assistant-browser::-webkit-scrollbar {
  display: none;
}

.browser-header {
  margin-bottom: 28px;
}

.browser-title {
  font-size: 22px;
  font-weight: 700;
  color: #1a2332;
  margin: 0 0 8px;
}

.browser-subtitle {
  font-size: 13px;
  color: #6b7f95;
  margin: 0;
}

/* Category Tabs */
.category-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.category-tab {
  padding: 6px 14px;
  border: none;
  border-radius: 999px;
  background: #f0f6fa;
  color: #4b5563;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.category-tab:hover {
  background: rgba(8, 145, 178, 0.1);
  color: #0891b2;
}

.category-tab--active {
  background: #1a2332;
  color: #ffffff;
  box-shadow: 0 2px 10px rgba(26, 35, 50, 0.25);
}

/* Assistant Grid */
.assistant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

/* Assistant Card */
.assistant-card {
  display: flex;
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(8, 145, 178, 0.12);
  border-radius: 14px;
  background: #ffffff;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    transform 0.15s ease;
}

.assistant-card:hover {
  border-color: rgba(8, 145, 178, 0.25);
  box-shadow: 0 4px 20px rgba(8, 145, 178, 0.1);
  transform: translateY(-2px);
}

.assistant-card:active {
  transform: scale(0.98);
}

.assistant-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.assistant-card-body {
  flex: 1;
  min-width: 0;
}

.assistant-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.assistant-card-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a2332;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.assistant-deploy-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  font-weight: 600;
  flex-shrink: 0;
}

.assistant-card-desc {
  font-size: 12px;
  color: #6b7f95;
  line-height: 1.5;
  margin: 0 0 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.assistant-card-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.assistant-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(8, 145, 178, 0.08);
  color: #0891b2;
  font-weight: 500;
}

.assistant-tag--deploy {
  background: rgba(8, 145, 178, 0.06);
  color: #6b7f95;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Assistant Chat Panel
   ═══════════════════════════════════════════════════════════════════════════ */
.assistant-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
}

/* Chat Header */
.chat-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafcfe;
  flex-shrink: 0;
}

.chat-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.chat-back-btn:hover {
  background: rgba(8, 145, 178, 0.08);
  color: #6b7f95;
}

.chat-header-name {
  font-size: 13px;
  font-weight: 600;
  color: #1a2332;
}

.chat-header-divider {
  width: 1px;
  height: 14px;
  background: #e5e7eb;
  margin: 0 4px;
}

.chat-header-connection {
  font-size: 11px;
  color: #9ca3af;
}

.chat-header-wechat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: #10b981;
}

.wechat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.chat-header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.chat-header-btn:hover {
  background: rgba(8, 145, 178, 0.06);
  color: #6b7f95;
}

.chat-header-spacer {
  flex: 1;
}

/* Chat Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 0;
  scrollbar-width: none;
}

.chat-messages::-webkit-scrollbar {
  display: none;
}

.chat-messages-inner {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Empty State */
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 55vh;
  gap: 14px;
  opacity: 0.6;
}

.chat-empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-empty-text {
  font-size: 13px;
  color: #6b7f95;
  margin: 0;
}

/* Message Row */
.chat-msg-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.chat-msg-row--user {
  justify-content: flex-end;
}

/* Avatar */
.chat-avatar {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.chat-avatar--user {
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
}

/* Message Bubble Wrapper */
.chat-msg-bubble-wrapper {
  max-width: 80%;
  min-width: 0;
}

/* Message Bubble */
.chat-msg-bubble {
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
  border-radius: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f5f9fb;
  color: #1a2332;
  border-bottom-left-radius: 4px;
}

.chat-msg-bubble--user {
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
  border-radius: 14px;
  border-bottom-right-radius: 4px;
}

/* AI Message Action Buttons */
.chat-msg-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 4px;
  padding-left: 2px;
}

.chat-msg-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.chat-msg-action-btn:hover {
  background: rgba(8, 145, 178, 0.08);
  color: #6b7f95;
}

/* Thinking Bubble */
.chat-thinking-bubble {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 10px 14px;
  border-radius: 14px;
  border-bottom-left-radius: 4px;
  background: #f5f9fb;
}

.thinking-dot {
  width: 5px;
  height: 5px;
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

/* Input Area */
.chat-input-area {
  padding: 0 24px 18px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.chat-input-card {
  width: 100%;
  max-width: 672px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
  background: #ffffff;
  overflow: visible;
}

.chat-input-textarea {
  width: 100%;
  padding: 10px 14px 4px;
  border: none;
  background: transparent;
  outline: none;
  resize: none;
  font-size: 13px;
  font-family: inherit;
  color: #1a2332;
  line-height: 1.5;
  box-sizing: border-box;
  min-height: 44px;
  max-height: 160px;
}

.chat-input-textarea::placeholder {
  color: #9ca3af;
}

/* Input Toolbar */
.chat-input-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px 10px;
}

.chat-toolbar-btn {
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

.chat-toolbar-btn:hover {
  background: rgba(8, 145, 178, 0.08);
  color: #6b7f95;
}

.chat-toolbar-permission {
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

.chat-toolbar-permission:hover {
  background: rgba(8, 145, 178, 0.06);
}

.chat-toolbar-diamond {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.chat-toolbar-diamond:hover {
  background: rgba(8, 145, 178, 0.08);
}

.chat-toolbar-spacer {
  flex: 1;
}

/* Model Selector */
.model-selector {
  position: relative;
}

.model-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: transparent;
  color: #6b7f95;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.model-btn:hover {
  background: rgba(8, 145, 178, 0.04);
}

.model-btn svg:first-child {
  color: #0891b2;
}

.model-dropdown {
  position: absolute;
  bottom: calc(100% + 6px);
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

/* Send Button */
.chat-send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: #e5e7eb;
  color: #9ca3af;
  cursor: pointer;
  transition:
    transform 0.1s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.chat-send-btn--active {
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(8, 145, 178, 0.3);
}

.chat-send-btn:active {
  transform: scale(0.9);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Overview Panel (Right Sidebar)
   ═══════════════════════════════════════════════════════════════════════════ */
.overview-panel {
  width: 220px;
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid #ebebeb;
  background: #ffffff;
  flex-shrink: 0;
}

.overview-toolbar {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.overview-toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.overview-toolbar-btn:hover {
  background: rgba(8, 145, 178, 0.06);
  color: #6b7f95;
}

.overview-toolbar-spacer {
  flex: 1;
}

/* Overview Content */
.overview-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  scrollbar-width: none;
}

.overview-content::-webkit-scrollbar {
  display: none;
}

.overview-section-title {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: #1a2332;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  margin-bottom: 2px;
}

.overview-section-title svg {
  color: #9ca3af;
  transition: transform 0.2s ease;
}

.overview-chevron--collapsed {
  transform: rotate(-90deg);
}

.overview-sections {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overview-subsection {
  display: flex;
  flex-direction: column;
}

.overview-subsection-title {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  margin-bottom: 8px;
}

.overview-subsection-title svg {
  color: #9ca3af;
  transition: transform 0.2s ease;
}

/* Task List */
.overview-task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.overview-task-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.overview-task-check {
  color: #9ca3af;
  flex-shrink: 0;
  margin-top: 1px;
}

.overview-task-text {
  font-size: 12px;
  line-height: 1.5;
  color: #9ca3af;
}

/* Output File */
.overview-output-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.overview-file-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.overview-file-name {
  font-size: 12px;
  line-height: 1.4;
  color: #374151;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Animations & Transitions
   ═══════════════════════════════════════════════════════════════════════════ */
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

/* Message transition */
.msg-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.msg-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.msg-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.msg-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Responsive
   ═══════════════════════════════════════════════════════════════════════════ */
@media (max-width: 1024px) {
  .overview-panel {
    width: 190px;
  }

  .assistant-browser {
    padding: 32px 32px 32px;
  }

  .assistant-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
}

@media (max-width: 768px) {
  .overview-panel {
    display: none;
  }

  .assistant-browser {
    padding: 24px 20px 24px;
  }

  .assistant-grid {
    grid-template-columns: 1fr;
  }

  .chat-input-area {
    padding: 0 16px 14px;
  }

  .chat-messages-inner {
    padding: 0 16px;
  }
}
</style>
