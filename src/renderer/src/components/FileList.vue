<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWorkspaceStore } from '@store/workspace'
import type { WorkspaceFileEntry } from '../../../preload/index.d'

const props = defineProps<{
  workspaceId: string
  /** 根路径（相对路径，'' 为顶层）；切换时重置展开状态 */
  rootPath?: string
}>()

const emit = defineEmits<{ (e: 'openFile', entry: WorkspaceFileEntry): void }>()

const workspaceStore = useWorkspaceStore()

/** 展开目录的条目（供展开态渲染） */
interface ExpandedDir {
  entry: WorkspaceFileEntry
  children: WorkspaceFileEntry[]
  loading: boolean
  error: string
}

/** 目录 relPath → 展开状态（懒加载缓存） */
const expanded = ref<Record<string, ExpandedDir>>({})
const rootLoading = ref(false)
const rootError = ref('')

// 根目录切换（工作空间变化 / 返回根）时重置
watch(
  () => [props.workspaceId, props.rootPath],
  () => {
    expanded.value = {}
    rootError.value = ''
    loadRoot()
  },
  { immediate: true }
)

/** 根条目：目录先行 + 保持主进程返回顺序 */
const rootEntries = ref<WorkspaceFileEntry[]>([])

async function loadRoot(): Promise<void> {
  rootLoading.value = true
  rootError.value = ''
  try {
    rootEntries.value = await workspaceStore.listFiles(props.workspaceId, props.rootPath ?? '')
  } catch (err) {
    rootError.value = err instanceof Error ? err.message : '读取目录失败'
    rootEntries.value = []
  } finally {
    rootLoading.value = false
  }
}

/** 展开/折叠目录（懒加载子级） */
async function toggleDir(dir: WorkspaceFileEntry): Promise<void> {
  if (expanded.value[dir.relPath]) {
    delete expanded.value[dir.relPath]
    return
  }
  expanded.value[dir.relPath] = { entry: dir, children: [], loading: true, error: '' }
  try {
    const children = await workspaceStore.listFiles(props.workspaceId, dir.relPath)
    if (expanded.value[dir.relPath]) {
      expanded.value[dir.relPath].children = children
    }
  } catch (err) {
    if (expanded.value[dir.relPath]) {
      expanded.value[dir.relPath].error = err instanceof Error ? err.message : '读取失败'
    }
  } finally {
    if (expanded.value[dir.relPath]) {
      expanded.value[dir.relPath].loading = false
    }
  }
}

/** 扁平化渲染行：目录 + 其展开的子级（depth 缩进） */
const rows = computed<Array<{ entry: WorkspaceFileEntry; depth: number }>>(() => {
  const result: Array<{ entry: WorkspaceFileEntry; depth: number }> = []
  const walk = (entries: WorkspaceFileEntry[], depth: number): void => {
    for (const e of entries) {
      result.push({ entry: e, depth })
      if (e.type === 'dir' && expanded.value[e.relPath]) {
        const state = expanded.value[e.relPath]
        if (state.error) {
          result.push({ entry: { name: state.error, type: 'file', relPath: `__err:${e.relPath}` }, depth: depth + 1 })
          continue
        }
        if (state.loading) {
          result.push({ entry: { name: '加载中…', type: 'file', relPath: `__loading:${e.relPath}` }, depth: depth + 1 })
          continue
        }
        if (state.children.length === 0) {
          result.push({ entry: { name: '（空目录）', type: 'file', relPath: `__empty:${e.relPath}` }, depth: depth + 1 })
          continue
        }
        walk(state.children, depth + 1)
      }
    }
  }
  walk(rootEntries.value, 0)
  return result
})
</script>

<template>
  <div class="fl">
    <p v-if="rootError" class="fl-error">{{ rootError }}</p>
    <div v-else class="fl-list">
      <div v-for="row in rows" :key="row.entry.relPath" class="fl-row" :style="{ paddingLeft: `${12 + row.depth * 14}px` }">
        <template v-if="row.entry.type === 'dir'">
          <button class="fl-dir" @click="toggleDir(row.entry)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              :class="['fl-chevron', { 'fl-chevron--open': expanded[row.entry.relPath] }]">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              class="fl-icon">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span class="fl-name">{{ row.entry.name }}</span>
          </button>
        </template>
        <template v-else>
          <div class="fl-file">
            <span class="fl-icon-gap"></span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              class="fl-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <button class="fl-file-name" :disabled="row.entry.relPath.startsWith('__')"
              @click="emit('openFile', row.entry)">
              {{ row.entry.name }}
            </button>
          </div>
        </template>
      </div>
      <p v-if="!rootLoading && rootEntries.length === 0" class="fl-empty">空目录</p>
      <p v-if="rootLoading" class="fl-loading">加载中…</p>
    </div>
  </div>
</template>

<style scoped>
.fl {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.fl-list {
  padding: 4px 0;
}

.fl-row {
  display: flex;
  align-items: center;
  padding-right: 8px;
}

.fl-dir {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 5px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #334155;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease;
}

.fl-dir:hover {
  background: rgba(8, 145, 178, 0.06);
}

.fl-chevron {
  color: #94a3b8;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.fl-chevron--open {
  transform: rotate(180deg);
}

.fl-row:has(.fl-dir:hover) .fl-chevron {
  color: #64748b;
}

.fl-icon {
  color: #94a3b8;
  flex-shrink: 0;
}

.fl-dir .fl-icon {
  color: #f59e0b;
}

.fl-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fl-file {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 5px 6px;
}

.fl-icon-gap {
  width: 12px;
  flex-shrink: 0;
}

.fl-file-name {
  flex: 1;
  border: none;
  background: transparent;
  padding: 0;
  color: #475569;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s ease;
}

.fl-file-name:not(:disabled):hover {
  color: #0891b2;
}

.fl-file-name:disabled {
  cursor: default;
  color: #94a3b8;
}

.fl-empty,
.fl-loading {
  margin: 0;
  padding: 10px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}

.fl-error {
  margin: 0;
  padding: 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #ef4444;
}
</style>
