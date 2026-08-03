<script setup lang="ts">
import { ref, watch } from 'vue'
import SystemSettingsPage from './pages/SystemSettingsPage.vue'
import AccountPage from './pages/AccountPage.vue'
import AgentSettingsPage from './pages/AgentSettingsPage.vue'
import PersonalizationPage from './pages/PersonalizationPage.vue'
import MemoryPage from './pages/MemoryPage.vue'
import ModelPage from './pages/ModelPage.vue'
import AssistantSettingsPage from './pages/AssistantSettingsPage.vue'
import DataManagementPage from './pages/DataManagementPage.vue'
import ShortcutsPage from './pages/ShortcutsPage.vue'
import SecurityPage from './pages/SecurityPage.vue'
import HelpFeedbackPage from './pages/HelpFeedbackPage.vue'

type PageKey =
  | 'system'
  | 'account'
  | 'agent'
  | 'personal'
  | 'memory'
  | 'model'
  | 'assistant'
  | 'data'
  | 'shortcuts'
  | 'security'
  | 'help'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  logout: []
}>()

/** 窗口可见性：由父组件 open prop 驱动，保证关闭时有退出动画 */
const visible = ref(props.open)
watch(
  () => props.open,
  (v) => {
    visible.value = v
  },
)

/** 关闭：先播放退出动画，再通知父组件同步状态 */
const closeWindow = (): void => {
  visible.value = false
  emit('close')
}

const activeKey = ref<PageKey>('system')

const navItems: { key: PageKey; label: string; icon: string }[] = [
  { key: 'system', label: '系统设置', icon: 'gear' },
  { key: 'account', label: '账户管理', icon: 'user' },
  { key: 'agent', label: '智能体设置', icon: 'puzzle' },
  { key: 'personal', label: '个性化', icon: 'sparkles' },
  { key: 'memory', label: '记忆', icon: 'brain' },
  { key: 'model', label: '模型', icon: 'box' },
  { key: 'assistant', label: '助理设置', icon: 'user-cog' },
  { key: 'data', label: '数据管理', icon: 'database' },
  { key: 'shortcuts', label: '快捷键', icon: 'keyboard' },
  { key: 'security', label: '安全中心', icon: 'shield' },
  { key: 'help', label: '帮助与反馈', icon: 'help' },
]

const subtitles: Partial<Record<PageKey, string>> = {
  system: '管理应用语言、更新与运行偏好',
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="visible"
      class="settings-mask"
      @click.self="closeWindow"
    >
      <div
        class="settings-card"
        @mousedown.stop
      >
        <!-- 左侧导航 -->
        <aside class="settings-aside">
          <div class="settings-brand">
            <svg
              width="22"
              height="22"
              viewBox="0 0 64 64"
              fill="none"
            >
              <defs>
                <linearGradient
                  id="stg1"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stop-color="#06b6d4"
                  />
                  <stop
                    offset="100%"
                    stop-color="#0e7490"
                  />
                </linearGradient>
              </defs>
              <ellipse
                cx="32"
                cy="38"
                rx="12"
                ry="14"
                fill="url(#stg1)"
              />
              <circle
                cx="32"
                cy="20"
                r="9"
                fill="url(#stg1)"
              />
              <circle
                cx="29"
                cy="19"
                r="2.5"
                fill="white"
              />
              <circle
                cx="29.5"
                cy="19"
                r="1.2"
                fill="#0e7490"
              />
            </svg>
            <span class="settings-brand-text">Ke-Work设置</span>
          </div>
          <nav class="settings-nav">
            <button
              v-for="item in navItems"
              :key="item.key"
              :class="['settings-nav-item', { 'settings-nav-item--active': activeKey === item.key }]"
              @click="activeKey = item.key"
            >
              <span :class="['settings-nav-icon', { 'settings-nav-icon--active': activeKey === item.key }]">
                <!-- 系统设置 -->
                <svg
                  v-if="item.icon === 'gear'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="3"
                  />
                  <path
                    d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                  />
                </svg>
                <!-- 账户管理 -->
                <svg
                  v-else-if="item.icon === 'user'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle
                    cx="12"
                    cy="8"
                    r="5"
                  />
                  <path d="M20 21a8 8 0 0 0-16 0" />
                </svg>
                <!-- 智能体设置 -->
                <svg
                  v-else-if="item.icon === 'puzzle'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect
                    width="20"
                    height="20"
                    x="2"
                    y="2"
                    rx="4"
                  />
                  <path d="M12 6a2 2 0 0 1 4 0v2h2a2 2 0 0 1 0 4h-2v2a2 2 0 0 1-4 0v-2h-2a2 2 0 0 1 0-4h2z" />
                </svg>
                <!-- 个性化 -->
                <svg
                  v-else-if="item.icon === 'sparkles'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                  <path d="M5 3v4" />
                  <path d="M19 17v4" />
                  <path d="M3 5h4" />
                  <path d="M17 19h4" />
                </svg>
                <!-- 记忆 -->
                <svg
                  v-else-if="item.icon === 'brain'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 0 0 12 18Z" />
                  <path d="M12 18a4 4 0 0 0 3.97 3.483A4 4 0 0 0 19.526 18a4 4 0 0 0 .556-6.588 4 4 0 0 0-2.526-5.77A3 3 0 0 0 12 5" />
                  <path d="M12 9v4" />
                  <circle
                    cx="12"
                    cy="11"
                    r=".5"
                  />
                  <circle
                    cx="16"
                    cy="13"
                    r=".5"
                  />
                  <circle
                    cx="8"
                    cy="13"
                    r=".5"
                  />
                  <path d="M12 9c.5 0 1-.2 1.2-.8" />
                </svg>
                <!-- 模型 -->
                <svg
                  v-else-if="item.icon === 'box'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                  <path d="m3.3 7 8.7 5 8.7-5" />
                  <path d="M12 22V12" />
                </svg>
                <!-- 助理设置 -->
                <svg
                  v-else-if="item.icon === 'user-cog'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle
                    cx="10"
                    cy="8"
                    r="4"
                  />
                  <path d="M4 21a6 6 0 0 1 12 0" />
                  <circle
                    cx="18.5"
                    cy="17.5"
                    r="3"
                  />
                  <path d="M18.5 12.5v1" />
                  <path d="M18.5 21.5v1" />
                  <path d="m15 14.5.87.5" />
                  <path d="m21 20.5.87.5" />
                  <path d="m15 20.5.87-.5" />
                  <path d="m21 14.5.87-.5" />
                </svg>
                <!-- 数据管理 -->
                <svg
                  v-else-if="item.icon === 'database'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <ellipse
                    cx="12"
                    cy="5"
                    rx="9"
                    ry="3"
                  />
                  <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                  <path d="M3 12A9 3 0 0 0 21 12" />
                </svg>
                <!-- 快捷键 -->
                <svg
                  v-else-if="item.icon === 'keyboard'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect
                    width="20"
                    height="16"
                    x="2"
                    y="4"
                    rx="2"
                  />
                  <path d="M6 8h.01" />
                  <path d="M10 8h.01" />
                  <path d="M14 8h.01" />
                  <path d="M18 8h.01" />
                  <path d="M8 12h.01" />
                  <path d="M12 12h.01" />
                  <path d="M16 12h.01" />
                  <path d="M7 16h10" />
                </svg>
                <!-- 安全中心 -->
                <svg
                  v-else-if="item.icon === 'shield'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
                  />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                <!-- 帮助与反馈 -->
                <svg
                  v-else-if="item.icon === 'help'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                  />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
              </span>
              <span>{{ item.label }}</span>
            </button>
          </nav>
        </aside>

        <!-- 主内容区 -->
        <main class="settings-main">
          <header class="settings-header">
            <div>
              <h1 class="settings-title">
                {{ navItems.find((n) => n.key === activeKey)?.label }}
              </h1>
              <p
                v-if="subtitles[activeKey]"
                class="settings-subtitle"
              >
                {{ subtitles[activeKey] }}
              </p>
            </div>
            <button
              class="settings-close"
              aria-label="关闭设置"
              @click="closeWindow"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <line
                  x1="18"
                  y1="6"
                  x2="6"
                  y2="18"
                />
                <line
                  x1="6"
                  y1="6"
                  x2="18"
                  y2="18"
                />
              </svg>
            </button>
          </header>

          <div class="settings-content">
            <SystemSettingsPage v-if="activeKey === 'system'" />
            <AccountPage
              v-else-if="activeKey === 'account'"
              @logout="emit('logout')"
            />
            <AgentSettingsPage v-else-if="activeKey === 'agent'" />
            <PersonalizationPage v-else-if="activeKey === 'personal'" />
            <MemoryPage v-else-if="activeKey === 'memory'" />
            <ModelPage v-else-if="activeKey === 'model'" />
            <AssistantSettingsPage v-else-if="activeKey === 'assistant'" />
            <DataManagementPage v-else-if="activeKey === 'data'" />
            <ShortcutsPage v-else-if="activeKey === 'shortcuts'" />
            <SecurityPage v-else-if="activeKey === 'security'" />
            <HelpFeedbackPage v-else-if="activeKey === 'help'" />
          </div>
        </main>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ═══════════════════ 设置窗口外壳 ═══════════════════ */
.settings-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
}

.settings-card {
  display: flex;
  width: min(1240px, calc(100vw - 32px));
  height: min(880px, calc(100vh - 32px));
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(8, 145, 178, 0.15);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.settings-aside {
  width: 290px;
  flex-shrink: 0;
  overflow-y: auto;
  background: #fafbfc;
  border-right: 1px solid #edf0f2;
  padding: 12px;
}

.settings-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 12px;
}

.settings-brand-text {
  font-size: 14px;
  font-weight: 700;
  color: #0891b2;
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: transparent;
  border-radius: 12px;
  padding: 10px 12px;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  color: #343a40;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.settings-nav-item:hover {
  background: #f0f6fa;
}

.settings-nav-item--active {
  background: #e0f2f8;
  color: #0e7490;
}

.settings-nav-icon {
  display: inline-flex;
  color: #1e2931;
}

.settings-nav-icon--active {
  color: #0891b2;
}

.settings-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: #fff;
  padding: 20px 24px;
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28px;
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a2332;
  letter-spacing: -0.01em;
}

.settings-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #9ca3af;
}

.settings-close {
  display: inline-flex;
  border: none;
  background: none;
  border-radius: 8px;
  padding: 8px;
  color: #59636b;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.settings-close:hover {
  background: #f2f5f5;
  color: #1d252a;
}

/* 弹层动画（对齐设计稿：遮罩 0.18s 淡入，卡片回弹缩放） */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.18s ease;
}

.modal-enter-active .settings-card,
.modal-leave-active .settings-card {
  transition: transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .settings-card,
.modal-leave-to .settings-card {
  transform: scale(0.98) translateY(8px);
}
</style>

<style>
/* ═══════════════════ 设置窗口共享样式（s- 前缀，11 个子页面共用） ═══════════════════ */
.s-card {
  background: #f7f9fb;
  border: 1px solid #f3f4f6;
  border-radius: 12px;
  padding: 14px 16px;
}

.s-card--white {
  background: #fff;
  border: 1px solid #e5e8e9;
}

.s-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.s-row--start {
  align-items: flex-start;
}

.s-sec-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a2332;
}

.s-desc {
  font-size: 13px;
  color: #6b7f95;
}

.s-desc strong {
  font-weight: 600;
  color: #4f575d;
}

.s-link {
  border: none;
  background: none;
  padding: 0;
  font-size: inherit;
  font-family: inherit;
  color: #0891b2;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.s-link:hover {
  opacity: 0.85;
}

.s-select-wrap {
  position: relative;
}

.s-select {
  width: 100%;
  height: 36px;
  padding: 0 32px 0 12px;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #1a2332;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  outline: none;
  cursor: pointer;
}

.s-select-chevron {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7f95;
  pointer-events: none;
}

/* select 尺寸变体（代理/提示音） */
.s-select--sm {
  height: 32px;
  border-radius: 999px;
  width: auto;
  min-width: 160px;
}

.s-select--sm + .s-select-chevron {
  right: 10px;
}

.s-select--lg {
  height: 44px;
  border-radius: 12px;
  width: auto;
  min-width: 150px;
  font-weight: 600;
}

.s-select--lg + .s-select-chevron {
  right: 14px;
  top: 50%;
}

.s-input {
  height: 40px;
  border-radius: 8px;
  border: 1px solid #e0e4e5;
  background: #fff;
  padding: 0 12px;
  font-size: 13px;
  color: #2c3337;
  outline: none;
  font-family: inherit;
}

.s-input:focus {
  border-color: #0891b2;
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.12);
}

.s-btn {
  border: 1px solid #dde1e3;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.s-btn:hover {
  background: #f7f9fb;
  color: #1a2332;
}

.s-btn--primary {
  border: none;
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #fff;
  font-weight: 600;
}

.s-btn--primary:hover {
  background: linear-gradient(135deg, #0e7490, #155e75);
  color: #fff;
}

.s-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  font-size: 13px;
  font-weight: 400;
  color: #2b3236;
  font-family: inherit;
}

.s-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(8, 145, 178, 0.12);
  color: #0891b2;
}

.s-sec-divider {
  border-bottom: 1px solid #e5e8e9;
}
</style>
