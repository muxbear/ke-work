<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/user'
import AssistantPage from './AssistantPage.vue'
import ProjectPage from './ProjectPage.vue'
import ExpertPage from './ExpertPage.vue'
import AutomationPage from './AutomationPage.vue'

const router = useRouter()
const userStore = useUserStore()

// ── Sidebar state ──
const sidebarCollapsed = ref(false)
const spaceOpen = ref(true)
const userMenuOpen = ref(false)
const activeSpaceMenu = ref<string | null>(null)
const activeChatMenu = ref<number | null>(null)
const userMenuRef = ref<HTMLElement | null>(null)
const collapsedSpaces = reactive<Record<string, boolean>>({
  KE-WORK工作台: false,
  研究助手: false
})

// ── Close menus on outside click ──
const handleDocumentClick = (e: MouseEvent): void => {
  const target = e.target as HTMLElement

  if (
    !target.closest('[data-usermenu-trigger]') &&
    (!userMenuRef.value || !userMenuRef.value.contains(target))
  ) {
    userMenuOpen.value = false
  }

  if (!target.closest('[data-space-menu-trigger]') && !target.closest('.space-menu')) {
    activeSpaceMenu.value = null
  }

  if (!target.closest('[data-chat-menu-trigger]') && !target.closest('.chat-menu')) {
    activeChatMenu.value = null
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentClick)
})

const toggleSpaceMenu = (spaceName: string): void => {
  activeSpaceMenu.value = activeSpaceMenu.value === spaceName ? null : spaceName
}

const toggleChatMenu = (chatId: number): void => {
  activeChatMenu.value = activeChatMenu.value === chatId ? null : chatId
}

const handleArchiveChat = (chatId: number): void => {
  console.log('Archive chat', chatId)
}

const handlePinChat = (chatId: number): void => {
  console.log('Pin chat', chatId)
}

const toggleSpaceCollapse = (spaceName: string): void => {
  collapsedSpaces[spaceName] = !collapsedSpaces[spaceName]
}

const handleAddSpaceItem = (spaceName: string): void => {
  // Placeholder for adding a new item under the space.
  console.log('Add item to', spaceName)
}

// ── Navigation ──
type NavKey = '新建任务' | '助理' | '项目' | '专家·技能·连接器' | '自动化' | '更多'
const activeNav = ref<NavKey>('新建任务')

const navItems = [
  { label: '助理' as NavKey, icon: 'bot' },
  { label: '项目' as NavKey, icon: 'folder' },
  { label: '专家·技能·连接器' as NavKey, icon: 'cpu' },
  { label: '自动化' as NavKey, icon: 'workflow' },
  { label: '更多' as NavKey, icon: 'more', tag: '资库·灵感' }
]

const recentChats = [
  { id: 1, space: 'KE-WORK工作台', title: '继续 ardot 设计核心与系统…', time: '4天前', active: true },
  { id: 2, space: 'KE-WORK工作台', title: '生成项目功能介绍', time: '6天前', active: false },
  { id: 3, space: '研究助手', title: '市场调研数据分析报告', time: '昨天', active: false }
]

const spaces = computed(() => {
  const map = new Map<string, typeof recentChats>()
  recentChats.forEach((c) => {
    if (!map.has(c.space)) map.set(c.space, [])
    map.get(c.space)!.push(c)
  })
  return [...map.entries()]
})

// ── New Task Page state ──
const category = ref('work')
const taskInput = ref('')
const model = ref('Auto')
const modelOpen = ref(false)
const messages = ref<{ role: 'user' | 'ai'; content: string }[]>([])
const thinking = ref(false)
const chipsScrollRef = ref<HTMLElement | null>(null)
const bottomRef = ref<HTMLElement | null>(null)

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
  const txt = taskInput.value.trim()
  taskInput.value = ''
  messages.value.push({ role: 'user', content: txt })
  thinking.value = true
  setTimeout(() => {
    thinking.value = false
    messages.value.push({
      role: 'ai',
      content: `收到你的任务「${txt}」，我来帮你处理……`
    })
    nextTick(() => bottomRef.value?.scrollIntoView({ behavior: 'smooth' }))
  }, 1400)
}

const handleLogout = (): void => {
  userMenuOpen.value = false
  userStore.logout()
  router.push('/')
}

const switchNav = (nav: NavKey): void => {
  activeNav.value = nav
  userMenuOpen.value = false
}
</script>

<template>
  <div class="home-layout">
    <!-- ═══════════════════════════════════════════════════ SIDEBAR ═══════════════════════════════════════════════════ -->
    <!-- Collapsed sidebar -->
    <aside v-if="sidebarCollapsed" class="sidebar sidebar--collapsed">
      <svg class="sidebar-logo-sm" width="26" height="26" viewBox="0 0 64 64" fill="none">
        <defs>
          <linearGradient id="hsg1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#0e7490" />
          </linearGradient>
        </defs>
        <ellipse cx="32" cy="38" rx="12" ry="14" fill="url(#hsg1)" />
        <circle cx="32" cy="20" r="9" fill="url(#hsg1)" />
        <circle cx="29" cy="19" r="2.5" fill="white" />
        <circle cx="29.5" cy="19" r="1.2" fill="#0e7490" />
      </svg>
      <button class="sidebar-collapse-btn" title="展开侧栏" @click="sidebarCollapsed = false">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
          <path d="M14 9l3 3-3 3" />
        </svg>
      </button>
    </aside>

    <!-- Expanded sidebar -->
    <aside v-else class="sidebar sidebar--expanded">
      <!-- Header: Logo + title -->
      <div class="sidebar-header">
        <div class="sidebar-brand">
          <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="hsg2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#06b6d4" />
                <stop offset="100%" stop-color="#0e7490" />
              </linearGradient>
            </defs>
            <ellipse cx="32" cy="38" rx="12" ry="14" fill="url(#hsg2)" />
            <circle cx="32" cy="20" r="9" fill="url(#hsg2)" />
            <circle cx="29" cy="19" r="2.5" fill="white" />
            <circle cx="29.5" cy="19" r="1.2" fill="#0e7490" />
          </svg>
          <div class="sidebar-brand-text">
            <p class="sidebar-title">KE-WORK</p>
            <p class="sidebar-version">v1.0.0</p>
          </div>
          <button class="sidebar-collapse-btn" title="收缩侧栏" @click="sidebarCollapsed = true">
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
              <path d="M9 3v18" />
              <path d="M14 15l-3-3 3-3" />
            </svg>
          </button>
        </div>
        <!-- Search -->
        <div class="sidebar-search">
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
          <input type="text" placeholder="搜索..." class="sidebar-search-input" />
        </div>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <button
          :class="['nav-item', { 'nav-item--active': activeNav === '新建任务' }]"
          @click="switchNav('新建任务')"
        >
          <span class="nav-icon">
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
          </span>
          <span class="nav-label">新建任务</span>
        </button>
        <button
          v-for="item in navItems"
          :key="item.label"
          :class="['nav-item', { 'nav-item--active': activeNav === item.label }]"
          @click="switchNav(item.label)"
        >
          <span class="nav-icon">
            <svg
              v-if="item.icon === 'bot'"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="3" width="18" height="14" rx="3" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <svg
              v-else-if="item.icon === 'folder'"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              />
            </svg>
            <svg
              v-else-if="item.icon === 'cpu'"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="9" y="9" width="6" height="6" />
              <line x1="9" y1="1" x2="9" y2="4" />
              <line x1="15" y1="1" x2="15" y2="4" />
              <line x1="9" y1="20" x2="9" y2="23" />
              <line x1="15" y1="20" x2="15" y2="23" />
              <line x1="20" y1="9" x2="23" y2="9" />
              <line x1="20" y1="14" x2="23" y2="14" />
              <line x1="1" y1="9" x2="4" y2="9" />
              <line x1="1" y1="14" x2="4" y2="14" />
            </svg>
            <svg
              v-else-if="item.icon === 'workflow'"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="2" y="3" width="6" height="6" rx="1" />
              <rect x="9" y="2" width="6" height="8" rx="1" />
              <rect x="16" y="3" width="6" height="6" rx="1" />
              <path d="M5 9v4a2 2 0 0 0 2 2h3M12 6v2M19 9v4a2 2 0 0 1-2 2h-2" />
            </svg>
            <svg
              v-else
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </span>
          <span class="nav-label">{{ item.label }}</span>
          <span v-if="item.tag" class="nav-tag">{{ item.tag }}</span>
        </button>
      </nav>

      <div class="sidebar-divider"></div>

      <!-- Spaces -->
      <div class="sidebar-spaces">
        <button class="spaces-toggle" @click="spaceOpen = !spaceOpen">
          <svg
            :class="{ 'rotate-n90': !spaceOpen }"
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
          <span>空间 ({{ spaces.length }})</span>
        </button>
        <Transition name="space-collapse">
          <div v-show="spaceOpen" class="spaces-list">
            <div v-for="[spaceName, chats] in spaces" :key="spaceName" class="space-group">
              <div class="space-header">
                <svg
                  v-if="spaceName === 'KE-WORK工作台'"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <path
                    d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                  />
                </svg>
                <svg
                  v-else
                  width="12"
                  height="12"
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
                <span>{{ spaceName }}</span>
                <div class="space-header-right">
                  <div class="space-header-actions">
                    <button
                      class="space-header-btn space-header-menu"
                      type="button"
                      data-space-menu-trigger
                      aria-label="更多"
                      title="更多"
                      @click.stop="toggleSpaceMenu(spaceName)"
                    >
                      <svg
                        width="12"
                        height="12"
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
                    <Transition name="dropdown">
                      <div v-if="activeSpaceMenu === spaceName" class="space-menu">
                        <button class="space-menu-item" type="button">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                          >
                            <path
                              d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                            />
                          </svg>
                          打开文件夹
                        </button>
                        <button class="space-menu-item space-menu-item--danger" type="button">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path
                              d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                            />
                          </svg>
                          从列表中删除
                        </button>
                      </div>
                    </Transition>
                    <button
                      class="space-header-btn space-header-add"
                      type="button"
                      title="添加子项"
                      @click.stop="handleAddSpaceItem(spaceName)"
                    >
                      <svg
                        width="12"
                        height="12"
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
                  </div>
                  <button
                    class="space-header-btn space-header-collapse"
                    type="button"
                    :class="{ 'space-header-collapse--collapsed': collapsedSpaces[spaceName] }"
                    :aria-expanded="!collapsedSpaces[spaceName]"
                    title="折叠 / 展开"
                    @click.stop="toggleSpaceCollapse(spaceName)"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              </div>
              <Transition name="space-collapse">
                <div v-show="!collapsedSpaces[spaceName]" class="space-children">
                  <div v-for="chat in chats" :key="chat.id" class="space-chat">
                    <div class="space-chat-main">
                      <p class="space-chat-title">{{ chat.title }}</p>
                    </div>
                    <div class="space-chat-actions">
                      <div class="chat-menu-wrapper">
                        <button
                          class="space-chat-action-btn"
                          data-chat-menu-trigger
                          title="更多"
                          @click.stop="toggleChatMenu(chat.id)"
                        >
                          <svg
                            width="12"
                            height="12"
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
                        <Transition name="dropdown">
                          <div v-if="activeChatMenu === chat.id" class="chat-menu">
                            <button class="chat-menu-item" type="button">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                              >
                                <path
                                  d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                                />
                              </svg>
                              打开文件夹
                            </button>
                            <button class="chat-menu-item" type="button">
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
                              重命名
                            </button>
                            <button class="chat-menu-item chat-menu-item--danger" type="button">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path
                                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                />
                              </svg>
                              删除任务
                            </button>
                          </div>
                        </Transition>
                      </div>
                      <button
                        class="space-chat-action-btn"
                        title="归档"
                        @click.stop="handleArchiveChat(chat.id)"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                        >
                          <polyline points="21 8 21 21 3 21 3 8" />
                          <rect x="1" y="3" width="22" height="5" />
                          <line x1="10" y1="12" x2="14" y2="12" />
                        </svg>
                      </button>
                      <button
                        class="space-chat-action-btn"
                        title="置顶"
                        @click.stop="handlePinChat(chat.id)"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                        >
                          <line x1="12" y1="17" x2="12" y2="22" />
                          <path
                            d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"
                          />
                        </svg>
                      </button>
                    </div>
                    <p class="space-chat-time">{{ chat.time }}</p>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Bottom area -->
      <div class="sidebar-bottom">
        <!-- User bar -->
        <div class="user-bar">
          <button
            class="user-avatar-btn"
            data-usermenu-trigger="true"
            @click="userMenuOpen = !userMenuOpen"
          >
            <div class="user-avatar">鸾</div>
            <span class="user-name">KE-WORK用户</span>
          </button>
          <button class="user-icon-btn">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
        </div>

        <!-- User Menu Popup -->
        <Transition name="menu-slide">
          <div v-if="userMenuOpen" ref="userMenuRef" class="user-menu">
            <!-- User header -->
            <div class="menu-header">
              <div class="menu-avatar">鸾</div>
              <span class="menu-username">KE-WORK用户</span>
              <button class="menu-copy-btn">
                <svg
                  width="14"
                  height="14"
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
            </div>
            <!-- Menu items -->
            <div class="menu-section">
              <button class="menu-item">
                <svg
                  width="15"
                  height="15"
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
                <span>设置</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <!-- Theme toggle -->
              <div class="menu-item-row">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <circle cx="12" cy="12" r="5" />
                  <path
                    d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                  />
                </svg>
                <span>外观</span>
                <div class="theme-toggle">
                  <button class="theme-opt theme-opt--active">浅色</button>
                  <button class="theme-opt">深色</button>
                </div>
              </div>
              <button class="menu-item">
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
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
                <span>帮助与反馈</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <button class="menu-item">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>检查更新</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <!-- Logout -->
            <button class="menu-logout" @click="handleLogout">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              退出登录
            </button>
          </div>
        </Transition>
      </div>
    </aside>

    <!-- ════════════════════════════════════════════════ CONTENT ═══════════════════════════════════════════════════════ -->
    <main class="content-area">
      <Transition name="page-fade" mode="out-in">
        <!-- ── New Task Page ── -->
        <div v-if="activeNav === '新建任务'" key="newtask" class="new-task-page">
          <!-- Welcome state -->
          <div v-if="messages.length === 0" class="welcome-area">
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
              <button
                class="chips-scroll-btn chips-scroll-btn--right"
                @click="scrollChips('right')"
              >
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
              <div class="input-toolbar">
                <button class="toolbar-btn">
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
                <button
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
              </div>
              <div class="input-footer">
                <button class="footer-action">
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
                  选择工作空间
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
          </div>

          <!-- Chat state -->
          <div v-else class="chat-area">
            <div class="chat-messages">
              <div
                v-for="(msg, i) in messages"
                :key="i"
                :class="['chat-bubble-row', { 'chat-bubble-row--user': msg.role === 'user' }]"
              >
                <div v-if="msg.role === 'ai'" class="chat-avatar chat-avatar--ai">
                  <svg width="20" height="20" viewBox="0 0 64 64" fill="none">
                    <ellipse cx="32" cy="38" rx="12" ry="14" fill="#0891b2" />
                    <circle cx="32" cy="20" r="9" fill="#0891b2" />
                    <circle cx="29" cy="19" r="2.5" fill="white" />
                    <circle cx="29.5" cy="19" r="1.2" fill="#0e7490" />
                  </svg>
                </div>
                <div :class="['chat-bubble', { 'chat-bubble--user': msg.role === 'user' }]">
                  {{ msg.content }}
                </div>
                <div v-if="msg.role === 'user'" class="chat-avatar chat-avatar--user">鸾</div>
              </div>
              <!-- Thinking indicator -->
              <div v-if="thinking" class="chat-bubble-row">
                <div class="chat-avatar chat-avatar--ai">
                  <svg width="20" height="20" viewBox="0 0 64 64" fill="none">
                    <ellipse cx="32" cy="38" rx="12" ry="14" fill="#0891b2" />
                    <circle cx="32" cy="20" r="9" fill="#0891b2" />
                    <circle cx="29" cy="19" r="2.5" fill="white" />
                    <circle cx="29.5" cy="19" r="1.2" fill="#0e7490" />
                  </svg>
                </div>
                <div class="chat-bubble thinking-bubble">
                  <span class="dot-pulse" style="animation-delay: 0s"></span>
                  <span class="dot-pulse" style="animation-delay: 0.15s"></span>
                  <span class="dot-pulse" style="animation-delay: 0.3s"></span>
                </div>
              </div>
              <div ref="bottomRef"></div>
            </div>
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
                <div class="input-toolbar input-toolbar--compact">
                  <button class="toolbar-btn">
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
                  <button
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
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Page components ── -->
        <AssistantPage v-else-if="activeNav === '助理'" key="assistant" />
        <ProjectPage v-else-if="activeNav === '项目'" key="project" />
        <ExpertPage v-else-if="activeNav === '专家·技能·连接器'" key="expert" />
        <AutomationPage v-else-if="activeNav === '自动化'" key="automation" />
        <div v-else key="placeholder" class="placeholder-page">
          <div class="placeholder-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
              stroke-linecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </div>
          <p class="placeholder-title">{{ activeNav }}</p>
          <p class="placeholder-desc">该功能正在开发中，敬请期待</p>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   Layout
   ═══════════════════════════════════════════════════════════════════════════ */
.home-layout {
  display: flex;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  font-family:
    'Inter',
    'Noto Sans SC',
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  background: #ffffff;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar — Collapsed
   ═══════════════════════════════════════════════════════════════════════════ */
.sidebar--collapsed {
  width: 52px;
  background: #f7f9fb;
  border-right: 1px solid rgba(8, 145, 178, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
  gap: 12px;
  flex-shrink: 0;
  user-select: none;
}

.sidebar-logo-sm {
  display: block;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar — Expanded
   ═══════════════════════════════════════════════════════════════════════════ */
.sidebar--expanded {
  width: 232px;
  background: #f7f9fb;
  border-right: 1px solid rgba(8, 145, 178, 0.1);
  display: flex;
  flex-direction: column;
  height: 100%;
  flex-shrink: 0;
  user-select: none;
  position: relative;
}

/* Header */
.sidebar-header {
  padding: 16px 16px 12px;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.sidebar-brand-text {
  flex: 1;
  min-width: 0;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 700;
  color: #0e7490;
  line-height: 1.3;
  margin: 0;
}

.sidebar-version {
  font-size: 10px;
  color: #94a3b8;
  line-height: 1.3;
  margin: 0;
}

.sidebar-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  background: transparent;
  color: #9ca3af;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.sidebar-collapse-btn:hover {
  background: rgba(8, 145, 178, 0.1);
  color: #6b7f95;
}

/* Search */
.sidebar-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(8, 145, 178, 0.06);
  border: 1px solid rgba(8, 145, 178, 0.1);
  color: #9ca3af;
}

.sidebar-search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 12px;
  font-family: inherit;
  color: #374151;
  min-width: 0;
}

.sidebar-search-input::placeholder {
  color: #9ca3af;
}

/* New Task button */
.sidebar-new-task {
  padding: 0 8px 8px;
}

.new-task-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(8, 145, 178, 0.25);
  transition:
    transform 0.1s ease,
    box-shadow 0.15s ease;
}

.new-task-btn:active {
  transform: scale(0.97);
}

.new-task-btn--active {
  background: rgba(8, 145, 178, 0.1);
  color: #0891b2;
  box-shadow: none;
  font-weight: 500;
}

.new-task-btn--active svg {
  color: #0891b2;
}

/* Navigation */
.sidebar-nav {
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: #4b5563;
  cursor: pointer;
  text-align: left;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.nav-item:hover {
  background: rgba(8, 145, 178, 0.05);
}

.nav-item--active {
  background: rgba(8, 145, 178, 0.1);
  color: #0891b2;
}

.nav-icon {
  display: flex;
  align-items: center;
  color: #9ca3af;
  flex-shrink: 0;
}

.nav-item--active .nav-icon {
  color: #0891b2;
}

.nav-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(8, 145, 178, 0.1);
  color: #0891b2;
  flex-shrink: 0;
}

/* Divider */
.sidebar-divider {
  margin: 4px 12px;
  border-top: 1px solid rgba(8, 145, 178, 0.08);
}

/* Spaces */
.sidebar-spaces {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
  scrollbar-width: none;
}

.sidebar-spaces::-webkit-scrollbar {
  display: none;
}

.spaces-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: color 0.15s ease;
  border-radius: 6px;
}

.spaces-toggle:hover {
  color: #6b7f95;
  background: rgba(8, 145, 178, 0.03);
}

.spaces-toggle svg {
  transition: transform 0.2s ease;
}

.spaces-toggle svg.rotate-n90 {
  transform: rotate(-90deg);
}

.spaces-list {
  padding: 0;
}

.space-group {
  padding: 2px 0;
}

.space-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  margin-bottom: 1px;
  color: #6b7f95;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  transition: background-color 0.15s ease;
}

.space-header:hover {
  background: rgba(8, 145, 178, 0.03);
}

.space-header span {
  flex: 1;
  color: #374151;
  font-weight: 500;
}

.space-header svg {
  color: #9ca3af;
  flex-shrink: 0;
}

.space-header-right {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.space-header-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.15s ease,
    visibility 0.15s ease;
}

.space-header:hover .space-header-actions {
  opacity: 1;
  visibility: visible;
}

.space-header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.space-header-btn:hover {
  background: rgba(8, 145, 178, 0.1);
  color: #0e7490;
}

.space-header-collapse svg {
  transition: transform 0.2s ease;
}

.space-header-collapse--collapsed svg {
  transform: rotate(-90deg);
}

.space-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 12px;
  min-width: 160px;
  padding: 6px 0;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  border: 1px solid rgba(8, 145, 178, 0.14);
  z-index: 10;
}

.space-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: #374151;
  font-size: 12px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.space-menu-item:hover {
  background: rgba(8, 145, 178, 0.08);
}

.space-menu-item svg {
  color: #9ca3af;
  flex-shrink: 0;
}

.space-menu-item--danger {
  color: #ef4444;
}

.space-menu-item--danger svg {
  color: #ef4444;
}

.space-menu-item--danger:hover {
  background: rgba(239, 68, 68, 0.06);
}

.space-chat {
  display: block;
  width: 100%;
  padding: 6px 12px 6px 38px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background-color 0.15s ease;
}

/* Space chat items */
.space-chat {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 8px 6px 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background-color 0.15s ease;
}

.space-chat:hover {
  background: rgba(8, 145, 178, 0.04);
}

.space-chat-main {
  flex: 1;
  min-width: 0;
}

.space-chat-title {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.space-chat-time {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: #9ca3af;
  margin: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.space-chat:hover .space-chat-time {
  opacity: 0;
}

/* Chat item hover actions */
.space-chat-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.15s ease,
    visibility 0.15s ease;
}

.space-chat:hover .space-chat-actions {
  opacity: 1;
  visibility: visible;
}

.space-chat-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.space-chat-action-btn:hover {
  background: rgba(8, 145, 178, 0.1);
  color: #0e7490;
}

/* Chat menu wrapper for positioning */
.chat-menu-wrapper {
  position: relative;
}

/* Chat menu dropdown */
.chat-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 150px;
  padding: 6px 0;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  border: 1px solid rgba(8, 145, 178, 0.14);
  z-index: 10;
}

.chat-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: #374151;
  font-size: 12px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.chat-menu-item:hover {
  background: rgba(8, 145, 178, 0.08);
}

.chat-menu-item svg {
  color: #9ca3af;
  flex-shrink: 0;
}

.chat-menu-item--danger {
  color: #ef4444;
}

.chat-menu-item--danger svg {
  color: #ef4444;
}

.chat-menu-item--danger:hover {
  background: rgba(239, 68, 68, 0.06);
}

/* Space collapse transition */
.space-collapse-enter-active,
.space-collapse-leave-active {
  transition:
    opacity 0.2s ease,
    max-height 0.25s ease;
  max-height: 500px;
  overflow: hidden;
}

.space-collapse-enter-from,
.space-collapse-leave-to {
  opacity: 0;
  max-height: 0;
}

/* Bottom */
.sidebar-bottom {
  margin-top: auto;
}

/* Promo card */
.promo-card {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 12px 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(8, 145, 178, 0.08), rgba(6, 182, 212, 0.06));
  border: 1px solid rgba(8, 145, 178, 0.12);
  color: #0891b2;
}

.promo-text {
  flex: 1;
  min-width: 0;
}

.promo-title {
  font-size: 11px;
  font-weight: 600;
  color: #0e7490;
  margin: 0;
}

.promo-sub {
  font-size: 10px;
  color: #6b7f95;
  margin: 0;
}

.promo-btn {
  padding: 4px 8px;
  border: none;
  border-radius: 8px;
  background: #0891b2;
  color: #ffffff;
  font-size: 10px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
}

/* User bar */
.user-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid rgba(8, 145, 178, 0.08);
}

.user-avatar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 4px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.15s ease;
}

.user-avatar-btn:hover {
  background: rgba(8, 145, 178, 0.07);
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-name {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-icon-btn {
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

.user-icon-btn:hover {
  background: rgba(8, 145, 178, 0.08);
  color: #6b7f95;
}

/* User Menu Popup */
.user-menu {
  position: absolute;
  bottom: 48px;
  left: 8px;
  width: 260px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.14),
    0 2px 8px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(8, 145, 178, 0.1);
  z-index: 30;
  overflow: hidden;
}

.menu-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.menu-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-username {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #1a2332;
}

.menu-copy-btn {
  display: flex;
  padding: 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.menu-copy-btn:hover {
  background: #f3f4f6;
}

.menu-section {
  border-bottom: 1px solid #f0f0f0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 20px;
  border: none;
  background: transparent;
  color: #1a2332;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease;
}

.menu-item:hover {
  background: rgba(8, 145, 178, 0.04);
}

.menu-item > svg:first-child {
  color: #6b7f95;
  flex-shrink: 0;
}

.menu-item > span {
  flex: 1;
  font-weight: 500;
}

.menu-item > svg:last-child {
  color: #d1d5db;
  flex-shrink: 0;
}

.menu-item-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  font-size: 13px;
}

.menu-item-row > svg:first-child {
  color: #6b7f95;
  flex-shrink: 0;
}

.menu-item-row > span {
  flex: 1;
  font-weight: 500;
  color: #1a2332;
}

.theme-toggle {
  display: flex;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #f3f4f6;
  overflow: hidden;
}

.theme-opt {
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border-radius: 6px;
  margin: 2px;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.theme-opt--active {
  background: #ffffff;
  color: #1a2332;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.menu-logout {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 20px;
  border: none;
  background: transparent;
  color: #ef4444;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease;
}

.menu-logout:hover {
  background: rgba(239, 68, 68, 0.04);
}

.menu-logout svg {
  color: #ef4444;
  flex-shrink: 0;
}

/* Menu slide animation */
.menu-slide-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.menu-slide-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.menu-slide-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

.menu-slide-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Content Area
   ═══════════════════════════════════════════════════════════════════════════ */
.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
  position: relative;
}

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

/* Points badge */
.points-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
}

.points-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(8, 145, 178, 0.3);
  transition:
    box-shadow 0.15s ease,
    transform 0.1s ease;
}

.points-btn:hover {
  box-shadow: 0 4px 14px rgba(8, 145, 178, 0.4);
}

.points-btn:active {
  transform: scale(0.95);
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
  margin-bottom: 28px;
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
  width: 100%;
  max-width: 720px;
  border-radius: 16px;
  border: 1.5px solid rgba(8, 145, 178, 0.2);
  box-shadow: 0 4px 24px rgba(8, 145, 178, 0.08);
  background: #ffffff;
  overflow: hidden;
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
  max-width: 70%;
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

/* Thinking bubble */
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
  border-radius: 16px;
  border: 1.5px solid rgba(8, 145, 178, 0.2);
  box-shadow: 0 2px 12px rgba(8, 145, 178, 0.06);
  background: #ffffff;
  overflow: hidden;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Placeholder Page
   ═══════════════════════════════════════════════════════════════════════════ */
.placeholder-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #9ca3af;
}

.placeholder-icon {
  color: #cbd5e1;
}

.placeholder-title {
  font-size: 18px;
  font-weight: 600;
  color: #6b7f95;
  margin: 0;
}

.placeholder-desc {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Page Transition
   ═══════════════════════════════════════════════════════════════════════════ */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.2s ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
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
@media (max-width: 1024px) {
  .sidebar--expanded {
    width: 200px;
  }
}

@media (max-width: 768px) {
  .sidebar--expanded {
    display: none;
  }

  .sidebar--collapsed {
    display: none;
  }

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

  .points-badge {
    top: 12px;
    right: 12px;
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
