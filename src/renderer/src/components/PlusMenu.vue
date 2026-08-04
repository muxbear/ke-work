<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCatalogStore, type CatalogTab, type Mode } from '@store/catalog'

/**
 * 「+」弹出菜单：5 个一级菜单项，hover 滑出右侧二级子菜单
 * - 添加文件：本地文件（系统选择器）/ 知识库（占位）
 * - 模式：默认/本地文件/知识库 互斥开关
 * - 专家：搜索 + 全部专家列表 + 召唤更多专家
 * - 技能：搜索 + 列表（选中即关闭菜单）+ 从本地添加/管理
 * - 连接器：搜索 + 列表（点击跳转并定位授权连接卡片）+ 管理
 */

defineProps<{ compact?: boolean }>()
const emit = defineEmits<{ close: []; navigate: [tab: CatalogTab] }>()

const store = useCatalogStore()

// ── hover 子菜单状态 ──
const activeSubmenu = ref<string | null>(null)
const toggleSubmenu = (key: string): void => {
  activeSubmenu.value = activeSubmenu.value === key ? null : key
}

// ── 轻量 toast（占位提示用，样式与页面级 toast 一致） ──
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
const showToast = (text: string): void => {
  toast.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 1500)
}

// ── 模式选项 ──
const modeOptions = [
  { key: 'default', label: '默认', icon: 'bolt' },
  { key: 'local', label: '本地文件', icon: 'file' },
  { key: 'knowledge', label: '知识库', icon: 'book' }
] as const

// ── 专家 / 技能 / 连接器搜索 ──
const expertSearch = ref('')
const skillSearch = ref('')
const connectorSearch = ref('')

const filteredExperts = computed(() => {
  const kw = expertSearch.value.trim().toLowerCase()
  if (!kw) return store.experts
  return store.experts.filter(
    (e) =>
      e.name.toLowerCase().includes(kw) ||
      e.title.toLowerCase().includes(kw) ||
      e.tags.some((t) => t.toLowerCase().includes(kw))
  )
})

const filteredSkills = computed(() => {
  const kw = skillSearch.value.trim().toLowerCase()
  if (!kw) return store.skillItems
  return store.skillItems.filter(
    (s) => s.name.toLowerCase().includes(kw) || s.desc.toLowerCase().includes(kw)
  )
})

const filteredConnectors = computed(() => {
  const kw = connectorSearch.value.trim().toLowerCase()
  if (!kw) return store.connectorItems
  return store.connectorItems.filter(
    (c) => c.name.toLowerCase().includes(kw) || c.desc.toLowerCase().includes(kw)
  )
})

// ── 本地文件选择（隐藏 input，零 IPC） ──
const fileInputRef = ref<HTMLInputElement | null>(null)
const pickLocalFiles = (): void => {
  fileInputRef.value?.click()
}
const onFilesSelected = (e: Event): void => {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.length) {
    // Electron 下 File 带 path；无 path 时回退文件名
    store.addLocalFiles(files.map((f) => (f as File & { path?: string }).path || f.name))
  }
  input.value = '' // 清空以便重复选择同一文件
  emit('close')
}

// ── 统一点击处理（模板表达式不允许多语句，收敛为方法） ──

/** 选择模式：设置 + 关闭菜单 */
const onSelectMode = (m: Mode): void => {
  store.setMode(m)
  emit('close')
}

/** 选择专家：单选 + 关闭菜单 */
const onSelectExpert = (id: number): void => {
  store.setExpert(id)
  emit('close')
}

/** 选择技能：多选切换 + 关闭菜单（可重开继续追加） */
const onSelectSkill = (id: number): void => {
  store.toggleSkill(id)
  emit('close')
}

/** 选择连接器：跳转连接器页并定位授权连接卡片 */
const onSelectConnector = (id: number): void => {
  store.gotoConnector(id)
  emit('navigate', 'connector')
  emit('close')
}

/** 导航项（召唤更多专家 / 管理技能 / 管理连接器） */
const onNavigate = (tab: CatalogTab): void => {
  emit('navigate', tab)
  emit('close')
}
</script>

<template>
  <div class="plus-menu" :class="{ 'plus-menu--compact': compact }">
    <!-- ══════════ ① 添加文件 ══════════ -->
    <div
      class="plus-menu-item-wrap"
      @mouseenter="activeSubmenu = 'file'"
      @mouseleave="activeSubmenu = null"
    >
      <button class="plus-menu-item" type="button" @click="toggleSubmenu('file')">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span>添加文件</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="plus-menu-chevron"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <Transition name="submenu-pop">
        <div v-if="activeSubmenu === 'file'" class="plus-submenu">
          <button class="plus-submenu-item" type="button" @click="pickLocalFiles">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              />
            </svg>
            <span>本地文件</span>
          </button>
          <button class="plus-submenu-item" type="button" @click="showToast('知识库功能即将上线')">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>知识库</span>
          </button>
        </div>
      </Transition>
    </div>

    <!-- ══════════ ② 模式 ══════════ -->
    <div
      class="plus-menu-item-wrap"
      @mouseenter="activeSubmenu = 'mode'"
      @mouseleave="activeSubmenu = null"
    >
      <button class="plus-menu-item" type="button" @click="toggleSubmenu('mode')">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span>模式</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="plus-menu-chevron"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <Transition name="submenu-pop">
        <div v-if="activeSubmenu === 'mode'" class="plus-submenu">
          <button
            v-for="opt in modeOptions"
            :key="opt.key"
            class="plus-submenu-item plus-submenu-item--mode"
            type="button"
            @click="onSelectMode(opt.key)"
          >
            <svg
              v-if="opt.icon === 'bolt'"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <svg
              v-else-if="opt.icon === 'file'"
              width="14"
              height="14"
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
              v-else
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span class="plus-submenu-text">{{ opt.label }}</span>
            <span class="plus-switch" :class="{ 'plus-switch--on': store.mode === opt.key }">
              <span class="plus-switch-knob"></span>
            </span>
          </button>
        </div>
      </Transition>
    </div>

    <!-- ══════════ ③ 专家 ══════════ -->
    <div
      class="plus-menu-item-wrap"
      @mouseenter="activeSubmenu = 'expert'"
      @mouseleave="activeSubmenu = null"
    >
      <button class="plus-menu-item" type="button" @click="toggleSubmenu('expert')">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polygon
            points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
          />
        </svg>
        <span>专家</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="plus-menu-chevron"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <Transition name="submenu-pop">
        <div v-if="activeSubmenu === 'expert'" class="plus-submenu">
          <div class="plus-submenu-search">
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
              v-model="expertSearch"
              type="text"
              placeholder="搜索专家"
              class="plus-submenu-search-input"
            />
          </div>
          <div class="plus-submenu-list">
            <button
              v-for="expert in filteredExperts"
              :key="expert.id"
              class="plus-submenu-item"
              type="button"
              @click="onSelectExpert(expert.id)"
            >
              <span class="plus-avatar-dot" :style="{ background: expert.color }">{{
                expert.initials
              }}</span>
              <span class="plus-submenu-text">{{ expert.name }}</span>
              <svg
                v-if="store.selectedExpertId === expert.id"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                class="plus-check"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <p v-if="filteredExperts.length === 0" class="plus-submenu-empty">无匹配专家</p>
          </div>
          <div class="plus-submenu-divider"></div>
          <button class="plus-submenu-item" type="button" @click="onNavigate('expert')">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>召唤更多专家</span>
          </button>
        </div>
      </Transition>
    </div>

    <!-- ══════════ ④ 技能 ══════════ -->
    <div
      class="plus-menu-item-wrap"
      @mouseenter="activeSubmenu = 'skill'"
      @mouseleave="activeSubmenu = null"
    >
      <button class="plus-menu-item" type="button" @click="toggleSubmenu('skill')">
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
        <span>技能</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="plus-menu-chevron"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <Transition name="submenu-pop">
        <div v-if="activeSubmenu === 'skill'" class="plus-submenu">
          <div class="plus-submenu-search">
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
              v-model="skillSearch"
              type="text"
              placeholder="搜索技能"
              class="plus-submenu-search-input"
            />
          </div>
          <div class="plus-submenu-list">
            <button
              v-for="skill in filteredSkills"
              :key="skill.id"
              class="plus-submenu-item"
              type="button"
              @click="onSelectSkill(skill.id)"
            >
              <span class="plus-skill-dot" :style="{ background: skill.color }">
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  stroke-width="3"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </span>
              <span class="plus-submenu-text">{{ skill.name }}</span>
              <svg
                v-if="store.selectedSkillIds.includes(skill.id)"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                class="plus-check"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <p v-if="filteredSkills.length === 0" class="plus-submenu-empty">无匹配技能</p>
          </div>
          <div class="plus-submenu-divider"></div>
          <button
            class="plus-submenu-item"
            type="button"
            @click="showToast('技能文件导入功能即将上线')"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>从本地添加技能</span>
          </button>
          <button class="plus-submenu-item" type="button" @click="onNavigate('skill')">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <span>管理技能</span>
          </button>
        </div>
      </Transition>
    </div>

    <!-- ══════════ ⑤ 连接器 ══════════ -->
    <div
      class="plus-menu-item-wrap"
      @mouseenter="activeSubmenu = 'connector'"
      @mouseleave="activeSubmenu = null"
    >
      <button class="plus-menu-item" type="button" @click="toggleSubmenu('connector')">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        <span>连接器</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="plus-menu-chevron"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <Transition name="submenu-pop">
        <div v-if="activeSubmenu === 'connector'" class="plus-submenu">
          <div class="plus-submenu-search">
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
              v-model="connectorSearch"
              type="text"
              placeholder="搜索连接器"
              class="plus-submenu-search-input"
            />
          </div>
          <div class="plus-submenu-list">
            <button
              v-for="conn in filteredConnectors"
              :key="conn.id"
              class="plus-submenu-item"
              type="button"
              @click="onSelectConnector(conn.id)"
            >
              <span class="plus-connector-dot" :style="{ background: conn.color }">
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  stroke-width="3"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </span>
              <span class="plus-submenu-text">{{ conn.name }}</span>
            </button>
            <p v-if="filteredConnectors.length === 0" class="plus-submenu-empty">无匹配连接器</p>
          </div>
          <div class="plus-submenu-divider"></div>
          <button class="plus-submenu-item" type="button" @click="onNavigate('connector')">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <span>管理连接器</span>
          </button>
        </div>
      </Transition>
    </div>

    <!-- 本地文件选择（隐藏，仅触发系统对话框） -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="plus-file-input"
      @change="onFilesSelected"
    />

    <!-- 轻量 toast -->
    <Transition name="dropdown">
      <div v-if="toast" class="plus-toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   Plus Menu（主菜单）
   ═══════════════════════════════════════════════════════════════════════════ */
.plus-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow:
    0 -2px 16px rgba(0, 0, 0, 0.1),
    0 4px 20px rgba(0, 0, 0, 0.08);
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

.plus-menu-item-wrap {
  position: relative;
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

/* 展开子菜单时保持高亮（mouseenter 到子菜单后按钮自身不再 hover） */
.plus-menu-item-wrap:hover .plus-menu-item {
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

/* ═══════════════════════════════════════════════════════════════════════════
   Plus Submenu（二级子菜单）
   ═══════════════════════════════════════════════════════════════════════════ */
.plus-submenu {
  position: absolute;
  left: calc(100% + 2px);
  top: 0;
  min-width: 200px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  z-index: 101;
}

.plus-submenu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 7px;
  color: #1e293b;
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.plus-submenu-item:hover {
  background: #f1f5f9;
}

.plus-submenu-item > svg:first-child {
  flex-shrink: 0;
  color: #64748b;
}

.plus-submenu-text {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plus-check {
  flex-shrink: 0;
  color: #0891b2;
}

.plus-submenu-empty {
  margin: 0;
  padding: 10px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}

.plus-submenu-divider {
  margin: 4px 6px;
  border-top: 1px solid #eef2f7;
}

/* 子菜单列表滚动区 */
.plus-submenu-list {
  max-height: 240px;
  overflow-y: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/* 搜索框 */
.plus-submenu-search {
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

.plus-submenu-search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 12px;
  font-family: inherit;
  color: #374151;
  min-width: 0;
}

.plus-submenu-search-input::placeholder {
  color: #9ca3af;
}

/* 专家：彩色头像点 */
.plus-avatar-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

/* 技能：彩色小方块图标 */
.plus-skill-dot {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 连接器：彩色圆点图标 */
.plus-connector-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 模式开关（radio 视觉：选中=开） */
.plus-switch {
  position: relative;
  width: 30px;
  height: 17px;
  border-radius: 999px;
  background: #e2e8f0;
  flex-shrink: 0;
  transition: background-color 0.15s ease;
}

.plus-switch--on {
  background: linear-gradient(135deg, #0891b2, #0e7490);
}

.plus-switch-knob {
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

.plus-switch--on .plus-switch-knob {
  transform: translateX(13px);
}

/* 隐藏的文件选择 input */
.plus-file-input {
  display: none;
}

/* Toast（固定视口底部居中，与页面级 toast 同视觉） */
.plus-toast {
  position: fixed;
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

/* Submenu pop transition */
.submenu-pop-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.submenu-pop-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}

.submenu-pop-enter-from {
  opacity: 0;
  transform: translateX(-4px);
}

.submenu-pop-leave-to {
  opacity: 0;
  transform: translateX(-2px);
}

/* Dropdown transition（toast） */
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
</style>
