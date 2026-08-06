<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/user'
import AssistantPage from './AssistantPage.vue'
import ProjectPage from './ProjectPage.vue'
import ExpertPage from './ExpertPage.vue'
import AutomationPage from './AutomationPage.vue'
import NewTaskPage from './NewTaskPage.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import SettingsWindow from '../components/settings/SettingsWindow.vue'
import { useAgentStore } from '@renderer/store/agent'
import { useWorkspaceStore } from '@renderer/store/workspace'
import type { Conversation } from '@renderer/store/agent'
import type { Workspace } from '../../../preload/index.d'

const router = useRouter()
const userStore = useUserStore()
const agentStore = useAgentStore()
const workspaceStore = useWorkspaceStore()

// ── 当前登录用户展示 ──
/** 显示名：用户名 → 手机号 → 兜底文案 */
const displayName = computed(
  () => userStore.userInfo?.username || userStore.userInfo?.mobile || 'KE-WORK用户'
)
/** 头像取显示名首字符 */
const avatarInitial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || 'K')

// ── Sidebar state ──
const sidebarCollapsed = ref(false)
const spaceOpen = ref(true)
const userMenuOpen = ref(false)
const activeSpaceMenu = ref<string | null>(null)
const activeChatMenu = ref<string | null>(null)
const userMenuRef = ref<HTMLElement | null>(null)
const collapsedSpaces = reactive<Record<string, boolean>>({})

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
  // 加载工作空间列表与会话列表（空间分组数据源）
  workspaceStore.load()
  agentStore.loadConversations()
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentClick)
})

const toggleSpaceMenu = (spaceKey: string): void => {
  activeSpaceMenu.value = activeSpaceMenu.value === spaceKey ? null : spaceKey
  adjustMenuDirection()
}

const toggleChatMenu = (chatId: string): void => {
  activeChatMenu.value = activeChatMenu.value === chatId ? null : chatId
  adjustMenuDirection()
}

// ── hover 菜单状态机：滑到三个点按钮上弹出，离开按钮/菜单区域隐藏 ──
// 标准模式：按钮 mouseleave 延迟关闭（给鼠标移到菜单的时间），
// 按钮/菜单 mouseenter 取消延迟，菜单 mouseleave 立即关闭（不依赖粘滞标志）
let spaceMenuCloseTimer: ReturnType<typeof setTimeout> | null = null
let chatMenuCloseTimer: ReturnType<typeof setTimeout> | null = null

const openHoverSpaceMenu = (spaceKey: string): void => {
  if (spaceMenuCloseTimer) clearTimeout(spaceMenuCloseTimer)
  activeSpaceMenu.value = spaceKey
  adjustMenuDirection()
}

/** 菜单面板 mouseenter：取消按钮离开时设置的延迟关闭 */
const spaceMenuEnter = (): void => {
  if (spaceMenuCloseTimer) clearTimeout(spaceMenuCloseTimer)
}

/** 三点按钮 mouseleave：延迟关闭，给鼠标移动到菜单的时间 */
const scheduleSpaceMenuClose = (): void => {
  if (spaceMenuCloseTimer) clearTimeout(spaceMenuCloseTimer)
  spaceMenuCloseTimer = setTimeout(() => {
    activeSpaceMenu.value = null
  }, 200)
}

/** 菜单面板 mouseleave：直接关闭 */
const closeHoverSpaceMenu = (): void => {
  activeSpaceMenu.value = null
}

const openHoverChatMenu = (chatId: string): void => {
  if (chatMenuCloseTimer) clearTimeout(chatMenuCloseTimer)
  activeChatMenu.value = chatId
  adjustMenuDirection()
}

const chatMenuEnter = (): void => {
  if (chatMenuCloseTimer) clearTimeout(chatMenuCloseTimer)
}

const scheduleChatMenuClose = (): void => {
  if (chatMenuCloseTimer) clearTimeout(chatMenuCloseTimer)
  chatMenuCloseTimer = setTimeout(() => {
    activeChatMenu.value = null
  }, 200)
}

const closeHoverChatMenu = (): void => {
  activeChatMenu.value = null
}

/** 从列表中删除工作空间（仅删记录，磁盘文件夹保留；该空间下的会话归"默认空间"） */
const deleteWorkspaceItem = async (wsId: string): Promise<void> => {
  activeSpaceMenu.value = null
  try {
    await workspaceStore.remove(wsId)
  } catch (err) {
    console.error('[Home] delete workspace failed:', err)
  }
}

const handleArchiveChat = (chatId: string): void => {
  console.log('Archive chat', chatId)
}

const handlePinChat = (chatId: string): void => {
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

/** 会话按工作空间分组（遍历 workspaceStore.workspaces，含无会话的空空间）；无绑定会话归"默认空间"组 */
interface ConversationGroup {
  key: string
  ws: Workspace
  chats: Conversation[]
}

const conversationGroups = computed<ConversationGroup[]>(() => {
  // 默认空间置顶，其余保持列表序（创建时间降序）
  const wsList = [...workspaceStore.workspaces].sort(
    (a, b) => Number(b.source === 'default') - Number(a.source === 'default')
  )
  const groups = wsList.map<ConversationGroup>((ws) => ({ key: ws.id, ws, chats: [] }))
  const byId = new Map(groups.map((g) => [g.ws.id, g]))
  // 工作空间已被删除（记录不在列表）→ 该会话归"默认空间"（metadata 保留但不再展示旧分组）
  const defaultGroup = workspaceStore.defaultWorkspace
    ? byId.get(workspaceStore.defaultWorkspace.id)
    : undefined
  for (const c of agentStore.sortedConversations) {
    const target = c.workspace?.id ? byId.get(c.workspace.id) : undefined
    ;(target ?? defaultGroup)?.chats.push(c)
  }
  return groups
})

/** 点击会话回显历史（拉取消息 → 切到新建任务页；不能用 switchNav，它会新建会话） */
const openConversation = async (id: string): Promise<void> => {
  activeChatMenu.value = null
  await agentStore.selectConversation(id)
  activeNav.value = '新建任务'
}

/** 打开空间文件夹：绑定空间打开其目录，默认空间打开默认工作空间目录 */
const openWorkspaceDir = (ws: Workspace): void => {
  activeSpaceMenu.value = null
  workspaceStore.open(ws.id)
}

/** 打开会话的工作目录：绑定空间打开其目录，未绑定（默认空间）打开默认工作空间目录 */
const openChatWorkspaceDir = (chat: Conversation): void => {
  activeChatMenu.value = null
  if (chat.workspace?.id) {
    workspaceStore.open(chat.workspace.id)
  } else {
    const id = workspaceStore.defaultWorkspace?.id
    if (id) workspaceStore.open(id)
  }
}

/** 删除会话（接 agentStore 已有 action；失败仅记日志，不打断其他操作） */
const deleteChat = async (id: string): Promise<void> => {
  activeChatMenu.value = null
  try {
    await agentStore.deleteConversation(id)
  } catch (err) {
    console.error('[Home] delete conversation failed:', err)
  }
}

// ── 重命名会话 ──
const renameTarget = ref<Conversation | null>(null)
const renameTitle = ref('')
const renameError = ref('')
const renaming = ref(false)

const openRename = (chat: Conversation): void => {
  activeChatMenu.value = null
  renameTarget.value = chat
  renameTitle.value = chat.title
  renameError.value = ''
}

const confirmRename = async (): Promise<void> => {
  if (!renameTarget.value || renaming.value) return
  const title = renameTitle.value.trim()
  if (!title) return
  renaming.value = true
  renameError.value = ''
  try {
    await agentStore.renameConversation(renameTarget.value.id, title)
    renameTarget.value = null
  } catch (err) {
    renameError.value = err instanceof Error ? err.message : '重命名失败'
  } finally {
    renaming.value = false
  }
}

/** 相对时间格式化：今天 HH:mm / 昨天 / N天前 */
const formatRelativeTime = (ts: number): string => {
  if (!ts) return ''
  const diff = Date.now() - ts
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`
  if (diff < day) return `${Math.floor(diff / hour)}小时前`
  if (diff < 2 * day) return '昨天'
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Logout ──
const showLogoutConfirm = ref(false)
const logoutPending = ref(false)
const logoutError = ref('')

/** 打开退出登录确认弹窗 */
const openLogoutConfirm = (): void => {
  logoutError.value = ''
  showLogoutConfirm.value = true
}

/** 确认后的实际登出：停止所有任务 → 清主进程会话 → 清本地 → 回登录页 */
const handleLogout = async (): Promise<void> => {
  if (logoutPending.value) return
  // 先快照账号：userStore.logout() 会清空 userInfo，必须在调用前取
  const account = userStore.userInfo?.username || userStore.userInfo?.mobile || ''
  logoutPending.value = true
  logoutError.value = ''
  try {
    agentStore.stopAllTasks() // 重置渲染层流状态（主进程任务停止由 auth:logout 联动）
    const result = await window.api.logout(account) // 主进程：停止全部任务 + 清 token + 清 session
    if (!result.success) throw new Error(result.error || '退出登录失败')
    showLogoutConfirm.value = false
    userMenuOpen.value = false
    userStore.logout() // 清渲染层 pinia + localStorage
    workspaceStore.reset() // 清工作空间列表/选中态，防切换账号残留
    await router.push('/') // 此时主进程 session 已清，守卫放行至登录页
  } catch (err: unknown) {
    // 主进程登出失败：保留本地登录态并提示，避免被守卫弹回 /home 的残缺态
    logoutError.value = err instanceof Error ? err.message : '退出登录失败，请重试'
  } finally {
    logoutPending.value = false
  }
}

// ── 设置窗口 ──
const settingsOpen = ref(false)

/** 打开设置窗口（同时收起用户菜单） */
const openSettings = (): void => {
  userMenuOpen.value = false
  settingsOpen.value = true
}

/** 设置窗口内点「退出登录」：先关设置窗口，再走现有确认流程 */
const handleSettingsLogout = (): void => {
  settingsOpen.value = false
  openLogoutConfirm()
}

const switchNav = (nav: NavKey): void => {
  activeNav.value = nav
  userMenuOpen.value = false
  if (nav === '新建任务') {
    // 仅进入欢迎态，不创建会话条目（发送第一条消息时才创建）
    agentStore.resetNewTask()
  }
}

/**
 * 菜单弹出方向自适应：菜单打开后测量位置，若超出视口底部则向上弹出（防遮挡）
 * 同一时间仅一个空间/会话菜单在 DOM 中，直接查询统一调整
 */
const adjustMenuDirection = (): void => {
  nextTick(() => {
    const menu = document.querySelector<HTMLElement>('.space-menu, .chat-menu')
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    menu.classList.toggle('menu--up', rect.bottom > window.innerHeight - 8)
  })
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
          <span>空间 ({{ conversationGroups.length }})</span>
        </button>
        <Transition name="space-collapse">
          <div v-show="spaceOpen" class="spaces-list">
            <div v-for="group in conversationGroups" :key="group.key" class="space-group">
              <div
                class="space-header"
                :class="{
                  'space-header--active': group.ws.id === workspaceStore.currentId,
                  'space-header--menu-open': activeSpaceMenu === group.key
                }"
              >
                <svg
                  v-if="group.ws.source !== 'default'"
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
                <span>
                  {{ group.ws.name }}
                  <span v-if="group.ws.id === workspaceStore.currentId" class="space-header-dot"></span>
                </span>
                <div class="space-header-right">
                  <div class="space-header-actions">
                    <button
                      class="space-header-btn space-header-menu"
                      type="button"
                      data-space-menu-trigger
                      aria-label="更多"
                      title="更多"
                      @click.stop="toggleSpaceMenu(group.key)"
                      @mouseenter="openHoverSpaceMenu(group.key)"
                      @mouseleave="scheduleSpaceMenuClose"
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
                    <!-- 菜单切换（hover 快速掠过多个按钮）时旧菜单立即移除，仅保留入场动画，
                         避免 Transition leave+enter 并存导致多个菜单叠放 -->
                    <div
                      v-if="activeSpaceMenu === group.key"
                      class="space-menu"
                      @mouseenter="spaceMenuEnter"
                      @mouseleave="closeHoverSpaceMenu"
                    >
                      <button
                        class="space-menu-item"
                        type="button"
                        @click.stop="openWorkspaceDir(group.ws)"
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
                          <path
                            d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                          />
                        </svg>
                        打开文件夹
                      </button>
                      <!-- 默认空间为机器级共享记录，不可从列表中删除 -->
                      <button
                        v-if="group.ws.source !== 'default'"
                        class="space-menu-item space-menu-item--danger"
                        type="button"
                        @click.stop="deleteWorkspaceItem(group.ws.id)"
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
                          <polyline points="3 6 5 6 21 6" />
                          <path
                            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                          />
                        </svg>
                        从列表中删除
                      </button>
                    </div>
                    <button
                      class="space-header-btn space-header-add"
                      type="button"
                      title="添加子项"
                      @click.stop="handleAddSpaceItem(group.ws.name)"
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
                    :class="{ 'space-header-collapse--collapsed': collapsedSpaces[group.key] }"
                    :aria-expanded="!collapsedSpaces[group.key]"
                    title="折叠 / 展开"
                    @click.stop="toggleSpaceCollapse(group.key)"
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
                <div v-show="!collapsedSpaces[group.key]" class="space-children">
                  <div
                    v-for="chat in group.chats"
                    :key="chat.id"
                    :class="[
                      'space-chat',
                      {
                        'space-chat--active': chat.id === agentStore.currentConversationId,
                        'space-chat--menu-open': activeChatMenu === chat.id
                      }
                    ]"
                    @click="openConversation(chat.id)"
                  >
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
                          @mouseenter="openHoverChatMenu(chat.id)"
                          @mouseleave="scheduleChatMenuClose"
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
                        <div
                          v-if="activeChatMenu === chat.id"
                          class="chat-menu"
                          @mouseenter="chatMenuEnter"
                          @mouseleave="closeHoverChatMenu"
                        >
                          <button
                            class="chat-menu-item"
                            type="button"
                            @click.stop="openChatWorkspaceDir(chat)"
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
                              <path
                                d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                              />
                            </svg>
                            打开文件夹
                          </button>
                          <button
                            class="chat-menu-item"
                            type="button"
                            @click.stop="openRename(chat)"
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
                              <polyline points="1 4 1 10 7 10" />
                              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                            </svg>
                            重命名
                          </button>
                          <button
                            class="chat-menu-item chat-menu-item--danger"
                            type="button"
                            @click.stop="deleteChat(chat.id)"
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
                              <polyline points="3 6 5 6 21 6" />
                              <path
                                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                              />
                            </svg>
                            删除任务
                          </button>
                        </div>
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
                    <p class="space-chat-time">{{ formatRelativeTime(chat.updateAt) }}</p>
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
            <div class="user-avatar">{{ avatarInitial }}</div>
            <span class="user-name">{{ displayName }}</span>
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
              <div class="menu-avatar">{{ avatarInitial }}</div>
              <span class="menu-username">{{ displayName }}</span>
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
              <button class="menu-item" @click="openSettings">
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
            <button class="menu-logout" :disabled="logoutPending" @click="openLogoutConfirm">
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
            <p v-if="logoutError" class="logout-error">{{ logoutError }}</p>
          </div>
        </Transition>
      </div>
    </aside>

    <!-- Logout confirm dialog -->
    <ConfirmDialog
      v-if="showLogoutConfirm"
      title="确认登出"
      message="登出后会停止所有正在执行中的任务（包括后台会话），确认要登出吗？"
      confirm-text="确认登出"
      @confirm="handleLogout"
      @cancel="showLogoutConfirm = false"
    />

    <!-- 设置窗口（置于 ConfirmDialog 之后：同层 z-index 按 DOM 顺序绘制，退出登录确认框盖在设置窗口之上） -->
    <SettingsWindow
      :open="settingsOpen"
      @close="settingsOpen = false"
      @logout="handleSettingsLogout"
    />

    <!-- 重命名会话 Modal -->
    <Transition name="modal">
      <div v-if="renameTarget" class="rename-mask" @click.self="renameTarget = null">
        <div class="rename-card">
          <div class="rename-header">
            <span>重命名会话</span>
            <button class="rename-close" aria-label="关闭" @click="renameTarget = null">
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
          <div class="rename-body">
            <input
              v-model="renameTitle"
              class="rename-input"
              maxlength="50"
              placeholder="输入新的会话标题"
              @keydown.enter.prevent="confirmRename"
            />
            <p v-if="renameError" class="rename-error">{{ renameError }}</p>
          </div>
          <div class="rename-footer">
            <button class="rename-btn rename-btn--cancel" @click="renameTarget = null">取消</button>
            <button
              class="rename-btn rename-btn--confirm"
              :disabled="renaming || !renameTitle.trim()"
              @click="confirmRename"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ════════════════════════════════════════════════ CONTENT ═══════════════════════════════════════════════════════ -->
    <main class="content-area">
      <Transition name="page-fade" mode="out-in">
        <!-- ── New Task Page ── -->
        <NewTaskPage v-if="activeNav === '新建任务'" key="newtask" @navigate="activeNav = $event" />
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

/* 当前激活工作空间（新建任务页右下角选中）标记：名字右侧红色实心圆点 */
.space-header--active svg {
  color: #0891b2;
}

.space-header--active span {
  color: #0891b2;
}

.space-header-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 6px;
  vertical-align: middle;
  border-radius: 50%;
  background: #ef4444;
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

.space-header:hover .space-header-actions,
/* 菜单打开时保持可见：菜单定位在组头边界外，鼠标移入菜单会离开 :hover 范围 */
.space-header--menu-open .space-header-actions {
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

/* 弹出方向自适应：超出视口底部时向上弹出（防遮挡） */
.space-menu.menu--up {
  top: auto;
  bottom: calc(100% + 6px);
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

.space-chat--active {
  background: rgba(8, 145, 178, 0.1);
}

.space-chat--active .space-chat-title {
  color: #0891b2;
  font-weight: 500;
}

.space-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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

.space-chat:hover .space-chat-actions,
/* 菜单打开时保持可见：菜单定位在会话项边界外，鼠标移入菜单会离开 :hover 范围 */
.space-chat--menu-open .space-chat-actions {
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

/* 弹出方向自适应：超出视口底部时向上弹出（防遮挡） */
.chat-menu.menu--up {
  top: auto;
  bottom: calc(100% + 4px);
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

.menu-logout:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.menu-logout svg {
  color: #ef4444;
  flex-shrink: 0;
}

.logout-error {
  margin: 0;
  padding: 0 20px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #ef4444;
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

/* 菜单入场动画：仅 enter（无 leave），切换时旧菜单立即移除，避免多个菜单叠放 */
@keyframes menu-drop-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.space-menu,
.chat-menu {
  animation: menu-drop-in 0.15s ease;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Rename Modal（重命名会话）
   ═══════════════════════════════════════════════════════════════════════════ */
.rename-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.rename-card {
  width: 360px;
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.rename-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  font-size: 15px;
  font-weight: 600;
  color: #1a2332;
}

.rename-close {
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

.rename-close:hover {
  background: #f3f4f6;
}

.rename-body {
  padding: 0 20px 8px;
}

.rename-input {
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

.rename-input:focus {
  border-color: #0891b2;
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.12);
}

.rename-error {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #ef4444;
}

.rename-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px 16px;
}

.rename-btn {
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

.rename-btn--cancel {
  background: #f3f4f6;
  color: #374151;
}

.rename-btn--cancel:hover {
  background: #e5e7eb;
}

.rename-btn--confirm {
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #ffffff;
}

.rename-btn--confirm:hover {
  opacity: 0.9;
}

.rename-btn--confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
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
}
</style>
