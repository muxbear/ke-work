<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useWorkspaceStore } from '@store/workspace'
import { useAgentStore } from '@store/agent'
import FileList from './FileList.vue'
import FilePreview from './FilePreview.vue'
import type { Workspace, WorkspaceFileEntry } from '../../../preload/index.d'

const props = defineProps<{ fullscreen: boolean }>()
const emit = defineEmits<{ (e: 'update:fullscreen', v: boolean): void }>()

const workspaceStore = useWorkspaceStore()
const agentStore = useAgentStore()

type ViewKey = 'overview' | 'files' | 'browser'

// ── 状态 ──
const open = ref(false) // 收起右栏（默认收缩，顶部只显示展开按钮）
const view = ref<ViewKey>('overview')
const viewMenuOpen = ref(false)
const artifactsOpen = ref(false)

/** 选中文件（含内容预览） */
interface Selection {
  entry: WorkspaceFileEntry
  content: string
  truncated: boolean
  loading?: boolean
}

/** 文件标签页（工作空间文件视图；顶栏标签条展示） */
interface FileTab {
  key: string // relPath，同文件去重键
  entry: WorkspaceFileEntry
  content: string
  truncated: boolean
  loading: boolean
  error: string
}
const fileTabs = ref<FileTab[]>([])
const activeTabKey = ref<string | null>(null)
const activeTab = computed(() => fileTabs.value.find((t) => t.key === activeTabKey.value) ?? null)

const artifactsSelection = ref<Selection | null>(null)

const viewLabels: Record<ViewKey, string> = {
  overview: '概览',
  files: '工作空间文件',
  browser: '浏览器'
}

// ── 数据源：会话绑定工作空间优先，当前选择兜底（与主进程"绑定优先"权威行为一致）──
const panelWorkspace = computed<Workspace | null>(() => {
  const bound = agentStore.currentConversation?.workspace
  if (bound?.id) {
    return workspaceStore.workspaces.find((w) => w.id === bound.id) ?? null
  }
  return workspaceStore.currentWorkspace
})

const panelWorkspaceId = computed(() => panelWorkspace.value?.id ?? null)

const sourceLabel: Record<Workspace['source'], string> = {
  created: '新建',
  external: '本地文件夹',
  timestamp: '临时',
  default: '默认'
}

/** 会话概要 */
const conversationSummary = computed(() => {
  const conv = agentStore.currentConversation
  const createAt = conv?.createAt ? formatDateTime(conv.createAt) : ''
  return {
    title: conv?.title ?? '新对话',
    createAt,
    messageCount: agentStore.currentMessages.length
  }
})

function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── 视图切换下拉 ──
const switchView = (key: ViewKey): void => {
  view.value = key
  viewMenuOpen.value = false
}

// 外部点击关闭下拉
const handleDocumentClick = (e: MouseEvent): void => {
  const target = e.target as HTMLElement
  if (!target.closest('[data-view-menu-trigger]') && !target.closest('.csp-view-menu')) {
    viewMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentClick)
})

/** 文件树点击：已开标签则激活，否则新建标签并读取内容 */
async function openFile(entry: WorkspaceFileEntry): Promise<void> {
  if (fileTabs.value.some((t) => t.key === entry.relPath)) {
    activeTabKey.value = entry.relPath
    return
  }
  fileTabs.value.push({
    key: entry.relPath,
    entry,
    content: '',
    truncated: false,
    loading: true,
    error: ''
  })
  activeTabKey.value = entry.relPath
  try {
    const result = await workspaceStore.readFile(panelWorkspaceId.value!, entry.relPath)
    const tab = fileTabs.value.find((t) => t.key === entry.relPath)
    if (tab) {
      tab.content = result.content
      tab.truncated = result.truncated
      tab.loading = false
    }
  } catch (err) {
    const tab = fileTabs.value.find((t) => t.key === entry.relPath)
    if (tab) {
      tab.error = err instanceof Error ? err.message : '读取失败'
      tab.loading = false
    }
  }
}

/** 产物区：保持旧的内联预览行为（不接入标签页） */
async function openArtifactFile(entry: WorkspaceFileEntry): Promise<void> {
  artifactsSelection.value = { entry, content: '', truncated: false, loading: true }
  try {
    const result = await workspaceStore.readFile(panelWorkspaceId.value!, entry.relPath)
    artifactsSelection.value = { entry, content: result.content, truncated: result.truncated }
  } catch (err) {
    artifactsSelection.value = {
      entry,
      content: `读取失败：${err instanceof Error ? err.message : '未知错误'}`,
      truncated: false
    }
  }
}

function activateTab(key: string): void {
  activeTabKey.value = key
}

/** 关闭标签：关闭激活标签时激活相邻（优先右侧），全部关闭回到文件树 */
function closeTab(key: string): void {
  const idx = fileTabs.value.findIndex((t) => t.key === key)
  if (idx === -1) return
  fileTabs.value.splice(idx, 1)
  if (activeTabKey.value === key) {
    const next = fileTabs.value[idx] ?? fileTabs.value[idx - 1]
    activeTabKey.value = next ? next.key : null
  }
}

function closeArtifactsSelection(): void {
  artifactsSelection.value = null
}

// 工作空间切换时清空标签与选中
watch(panelWorkspaceId, () => {
  fileTabs.value = []
  activeTabKey.value = null
  artifactsSelection.value = null
  artifactsOpen.value = false
})

// ── 收起 / 全屏 ──
const toggleFullscreen = (): void => {
  emit('update:fullscreen', !props.fullscreen)
}

/** 收起右栏：全屏态先退全屏再收起，避免空白态 */
const collapsePanel = (): void => {
  if (props.fullscreen) {
    emit('update:fullscreen', false)
  }
  open.value = false
}

/** 展开右栏（收起态顶部展开按钮） */
const expandPanel = (): void => {
  open.value = true
}
</script>

<template>
  <aside :class="['csp', { 'csp--collapsed': !open, 'csp--fullscreen': fullscreen }]">
    <!-- 顶部按钮栏：收起态只显示展开按钮 -->
    <div class="csp-topbar">
      <template v-if="open">
        <!-- 文件标签条（与「收起右栏」按钮同行） -->
        <div v-if="fileTabs.length" class="csp-tabs">
          <button
            v-for="tab in fileTabs"
            :key="tab.key"
            :class="['csp-tab', { 'csp-tab--active': tab.key === activeTabKey }]"
            :title="tab.entry.relPath"
            @click="activateTab(tab.key)"
          >
            <span class="csp-tab-name">{{ tab.entry.name }}</span>
            <span class="csp-tab-close" title="关闭" @click.stop="closeTab(tab.key)">×</span>
          </button>
        </div>
        <button class="csp-icon-btn" :title="fullscreen ? '退出全屏' : '全屏'" @click="toggleFullscreen">
          <svg v-if="!fullscreen" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
          </svg>
        </button>
        <button class="csp-icon-btn" title="收起右栏" @click="collapsePanel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </template>
      <button v-else class="csp-icon-btn csp-expand-btn" title="展开右侧" @click="expandPanel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
    </div>

    <template v-if="open">
    <!-- 视图切换（概览 + 下拉菜单） -->
    <div class="csp-view-head" data-view-menu-trigger @click="viewMenuOpen = !viewMenuOpen">
      <span>{{ viewLabels[view] }}</span>
      <svg :class="['csp-view-chevron', { 'csp-view-chevron--open': viewMenuOpen }]" width="12" height="12"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
      <Transition name="dropdown">
        <div v-if="viewMenuOpen" class="csp-view-menu">
          <button v-for="(label, key) in viewLabels" :key="key" :class="['csp-view-menu-item', { 'csp-view-menu-item--active': view === key }]"
            @click="switchView(key as ViewKey)">
            <svg v-if="view === key" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span v-else class="csp-view-menu-gap"></span>
            {{ label }}
          </button>
        </div>
      </Transition>
    </div>

    <!-- 视图体 -->
    <div class="csp-body">
      <!-- 概览 -->
      <template v-if="view === 'overview'">
        <template v-if="panelWorkspace">
          <div class="csp-card">
            <p class="csp-card-name">{{ panelWorkspace.name }}</p>
            <p class="csp-card-path" :title="panelWorkspace.path">{{ panelWorkspace.path }}</p>
            <div class="csp-card-meta">
              <span class="csp-source">{{ sourceLabel[panelWorkspace.source] }}</span>
              <button class="csp-open" @click="workspaceStore.open(panelWorkspace.id)">打开文件夹</button>
            </div>
          </div>
          <div class="csp-card">
            <p class="csp-card-sub">当前会话</p>
            <p class="csp-card-title">{{ conversationSummary.title }}</p>
            <p class="csp-card-line">创建时间：{{ conversationSummary.createAt }}</p>
            <p class="csp-card-line">消息数：{{ conversationSummary.messageCount }}</p>
          </div>
          <p class="csp-hint">当前任务的工作文件夹：智能体将在此目录读写文件、生成产物</p>
        </template>
        <div v-else class="csp-empty">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <p class="csp-empty-title">未选择工作空间</p>
          <p class="csp-empty-hint">前往「新建任务」输入框下方选择工作空间</p>
        </div>
      </template>

      <!-- 工作空间文件 -->
      <template v-else-if="view === 'files'">
        <div v-if="activeTab" class="csp-view-body">
          <p v-if="activeTab.loading" class="csp-empty-tip">加载中…</p>
          <p v-else-if="activeTab.error" class="csp-load-error">{{ activeTab.error }}</p>
          <FilePreview
            v-else
            :name="activeTab.entry.name"
            :rel-path="activeTab.entry.relPath"
            :content="activeTab.content"
            :truncated="activeTab.truncated"
            :show-back="false"
          />
        </div>
        <div v-else-if="panelWorkspaceId" class="csp-view-body">
          <FileList :workspace-id="panelWorkspaceId" @open-file="openFile" />
        </div>
        <p v-else class="csp-empty-tip">未选择工作空间</p>
      </template>

      <!-- 浏览器（占位） -->
      <template v-else>
        <p class="csp-empty-tip">浏览器视图开发中</p>
      </template>
    </div>

    <!-- 产物区（常驻） -->
    <div class="csp-artifacts">
      <button class="csp-artifact-head" data-artifact-toggle @click="artifactsOpen = !artifactsOpen">
        <span>产物</span>
        <svg :class="['csp-artifact-chevron', { 'csp-artifact-chevron--open': artifactsOpen }]" width="12" height="12"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <Transition name="space-collapse">
        <div v-show="artifactsOpen" class="csp-artifact-body">
          <div v-if="artifactsSelection" class="csp-view-body csp-view-body--artifacts">
            <FilePreview :name="artifactsSelection.entry.name" :rel-path="artifactsSelection.entry.relPath"
              :content="artifactsSelection.content" :truncated="artifactsSelection.truncated"
              @back="closeArtifactsSelection" />
          </div>
          <div v-else-if="panelWorkspaceId" class="csp-view-body csp-view-body--artifacts">
            <!-- key 变化保证每次展开/换空间时 FileList 重新加载根列表 -->
            <FileList :key="`${panelWorkspaceId}-${artifactsOpen}`" :workspace-id="panelWorkspaceId"
              @open-file="openArtifactFile" />
          </div>
          <p v-else class="csp-empty-tip">未选择工作空间</p>
        </div>
      </Transition>
    </div>
    </template>
  </aside>
</template>

<style scoped>
.csp {
  width: 300px;
  flex-shrink: 0;
  border-left: 1px solid rgba(8, 145, 178, 0.1);
  background: #f7f9fb;
  display: flex;
  flex-direction: column;
  min-height: 0;
  transition: width 0.25s ease;
  user-select: none;
}

.csp--fullscreen {
  width: 100%;
  flex: 1;
}

/* 收起态：40px 窄条，只显示展开按钮 */
.csp--collapsed {
  width: 40px;
  overflow: hidden;
}

.csp--collapsed .csp-topbar {
  justify-content: center;
  padding: 10px 0 4px;
}

.csp-expand-btn {
  color: #0891b2;
}

/* 顶部按钮栏 */
.csp-topbar {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 10px 12px 4px;
  flex-shrink: 0;
}

.csp-icon-btn {
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
  transition: background-color 0.15s ease, color 0.15s ease;
}

.csp-icon-btn:hover {
  background: rgba(8, 145, 178, 0.1);
  color: #0e7490;
}

/* 视图切换头 */
.csp-view-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #1a2332;
  cursor: pointer;
  border-radius: 6px;
  margin: 0 8px;
  flex-shrink: 0;
  transition: background-color 0.15s ease;
}

.csp-view-head:hover {
  background: rgba(8, 145, 178, 0.06);
}

.csp-view-chevron {
  color: #9ca3af;
  transition: transform 0.2s ease;
}

.csp-view-chevron--open {
  transform: rotate(180deg);
}

.csp-view-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 8px;
  min-width: 150px;
  padding: 6px 0;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  border: 1px solid rgba(8, 145, 178, 0.14);
  z-index: 30;
}

.csp-view-menu-item {
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

.csp-view-menu-item:hover {
  background: rgba(8, 145, 178, 0.08);
}

.csp-view-menu-item--active {
  color: #0891b2;
}

.csp-view-menu-item svg {
  color: #0891b2;
  flex-shrink: 0;
}

.csp-view-menu-gap {
  width: 11px;
  flex-shrink: 0;
}

/* 视图体 */
.csp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.csp-view-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.csp-view-body--artifacts {
  min-height: 160px;
  max-height: 240px;
}

/* 概览卡片 */
.csp-card {
  background: #ffffff;
  border: 1px solid rgba(8, 145, 178, 0.14);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.csp-card-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1a2332;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.csp-card-path {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #94a3b8;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.csp-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.csp-source {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(8, 145, 178, 0.08);
  color: #0891b2;
  flex-shrink: 0;
}

.csp-open {
  padding: 4px 10px;
  border: none;
  border-radius: 8px;
  background: rgba(8, 145, 178, 0.1);
  color: #0891b2;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s ease;
}

.csp-open:hover {
  background: rgba(8, 145, 178, 0.18);
}

.csp-card-sub {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
}

.csp-card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #1a2332;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.csp-card-line {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}

.csp-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: #94a3b8;
  flex-shrink: 0;
}

.csp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 8px;
  color: #cbd5e1;
  text-align: center;
  flex-shrink: 0;
}

.csp-empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: #6b7f95;
}

.csp-empty-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: #94a3b8;
}

.csp-empty-tip {
  margin: 0;
  padding: 20px 8px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}

/* 产物区 */
.csp-artifacts {
  border-top: 1px solid rgba(8, 145, 178, 0.1);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  max-height: 40%;
}

.csp-artifact-head {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: #1a2332;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease;
}

.csp-artifact-head:hover {
  background: rgba(8, 145, 178, 0.04);
}

.csp-artifact-head span {
  flex: 1;
}

.csp-artifact-chevron {
  color: #9ca3af;
  transition: transform 0.2s ease;
}

.csp-artifact-chevron--open {
  transform: rotate(180deg);
}

.csp-artifact-body {
  padding: 0 8px 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Space collapse transition（产物展开） */
.space-collapse-enter-active,
.space-collapse-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s ease;
  max-height: 400px;
  overflow: hidden;
}

.space-collapse-enter-from,
.space-collapse-leave-to {
  opacity: 0;
  max-height: 0;
}

/* 文件标签条 */
.csp-tabs {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.csp-tabs::-webkit-scrollbar {
  display: none;
}

.csp-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 160px;
  padding: 3px 8px;
  border: 1px solid rgba(8, 145, 178, 0.14);
  border-radius: 8px;
  background: #ffffff;
  color: #374151;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.csp-tab:hover {
  background: rgba(8, 145, 178, 0.06);
}

.csp-tab--active {
  background: rgba(8, 145, 178, 0.1);
  border-color: rgba(8, 145, 178, 0.3);
  color: #0891b2;
}

.csp-tab-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.csp-tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  color: #94a3b8;
  flex-shrink: 0;
}

.csp-tab-close:hover {
  background: rgba(8, 145, 178, 0.15);
  color: #0e7490;
}

.csp-load-error {
  margin: 0;
  padding: 20px 8px;
  font-size: 12px;
  color: #ef4444;
  text-align: center;
}

@media (max-width: 768px) {
  .csp {
    display: none;
  }
}
</style>
