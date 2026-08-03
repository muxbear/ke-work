<script setup lang="ts">
import { computed, ref } from 'vue'

const shortcutQuery = ref('')
const removedShortcuts = ref<string[]>([])

const shortcuts: { command: string; keys: string[] }[] = [
  { command: '打开设置', keys: ['Ctrl', ','] },
  { command: '语音录制开关', keys: ['Ctrl', 'D'] },
  { command: '对话内搜索', keys: ['Ctrl', 'F'] },
  { command: '发送消息', keys: ['Enter'] },
  { command: '输入时换行', keys: ['Shift', 'Enter'] },
  { command: '新建对话', keys: ['Ctrl', 'N'] },
  { command: '停止生成', keys: ['Esc'] },
  { command: '上一个任务', keys: ['Ctrl', '['] },
  { command: '下一个任务', keys: ['Ctrl', ']'] },
  { command: '切换左侧栏', keys: ['Ctrl', 'B'] },
  { command: '切换右侧产物面板', keys: ['Ctrl', 'Shift', 'B'] },
  { command: '进入/退出全屏', keys: ['F11'] },
  { command: '唤起/隐藏主窗口', keys: ['Shift', 'Alt', 'W'] },
  { command: '创建任务', keys: ['Ctrl', 'Shift', 'N'] },
  { command: '打开搜索', keys: ['Ctrl', 'K'] },
  { command: '切换深色模式', keys: ['Ctrl', 'Shift', 'L'] },
  { command: '关闭当前对话', keys: ['Ctrl', 'W'] },
  { command: '刷新页面', keys: ['Ctrl', 'R'] },
]

const visibleShortcuts = computed(() =>
  shortcuts.filter(
    (item) =>
      !removedShortcuts.value.includes(item.command) && item.command.includes(shortcutQuery.value),
  ),
)

const removeShortcut = (command: string): void => {
  removedShortcuts.value = [...removedShortcuts.value, command]
}

const resetAll = (): void => {
  shortcutQuery.value = ''
  removedShortcuts.value = []
}
</script>

<template>
  <div class="s-page">
    <p class="s-count">
      共 {{ shortcuts.length }} 条
    </p>
    <div class="s-toolbar">
      <div class="s-search-wrap">
        <svg
          class="s-search-icon"
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
            cx="11"
            cy="11"
            r="8"
          />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          v-model="shortcutQuery"
          placeholder="搜索快捷键"
          class="s-search-input"
        >
      </div>
      <button
        class="s-reset-btn"
        @click="resetAll"
      >
        全部恢复默认
      </button>
    </div>

    <div class="s-table">
      <div class="s-table-head">
        <span>命令</span>
        <span>按键绑定</span>
        <span>操作</span>
      </div>
      <div class="s-table-body">
        <div
          v-for="item in visibleShortcuts"
          :key="item.command"
          class="s-table-row"
        >
          <span class="s-command">{{ item.command }}</span>
          <div class="s-keys">
            <span
              v-for="(key, index) in item.keys"
              :key="`${key}-${index}`"
              class="s-kbd"
            >{{ key }}</span>
          </div>
          <button
            class="s-del-btn"
            :aria-label="`删除${item.command}快捷键`"
            @click="removeShortcut(item.command)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v5M14 11v5" />
            </svg>
          </button>
        </div>
        <p
          v-if="visibleShortcuts.length === 0"
          class="s-empty"
        >
          未找到匹配的快捷键
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.s-page {
  max-width: 1060px;
  padding-bottom: 32px;
}

.s-count {
  font-size: 14px;
  color: #767e83;
  margin-bottom: 24px;
}

.s-toolbar {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.s-search-wrap {
  position: relative;
  flex: 1;
}

.s-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #8d969b;
  pointer-events: none;
}

.s-search-input {
  width: 100%;
  height: 40px;
  border-radius: 12px;
  border: 1px solid #dfe3e4;
  background: #fff;
  padding: 0 12px 0 40px;
  font-size: 14px;
  color: #2d3438;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.s-search-input:focus {
  border-color: #0891b2;
}

.s-search-input::placeholder {
  color: #aeb4b7;
}

.s-reset-btn {
  flex-shrink: 0;
  border: 1px solid #e2e6e7;
  background: #fff;
  border-radius: 12px;
  padding: 0 16px;
  font-size: 14px;
  color: #a3aaae;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.s-reset-btn:hover {
  color: #59636b;
  border-color: #d1d7db;
}

.s-table {
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid #dfe3e4;
  background: #fff;
}

.s-table-head,
.s-table-row {
  display: grid;
  grid-template-columns: 1.1fr 1.25fr 90px;
  align-items: center;
  padding: 0 20px;
}

.s-table-head {
  background: #f6f7f7;
  padding-top: 12px;
  padding-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
  color: #747d82;
  border-bottom: 1px solid #dfe3e4;
}

.s-table-body {
  max-height: 640px;
  overflow-y: auto;
}

.s-table-row {
  padding-top: 10px;
  padding-bottom: 10px;
  font-size: 15px;
  color: #1e2427;
  border-bottom: 1px solid #e2e6e7;
}

.s-table-row:last-child {
  border-bottom: none;
}

.s-command {
  padding-right: 16px;
}

.s-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.s-del-btn {
  width: fit-content;
  border: none;
  background: none;
  border-radius: 6px;
  padding: 6px;
  color: #7b858a;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.s-del-btn:hover {
  background: #fceeee;
  color: #cf4545;
}

.s-empty {
  padding: 48px 20px;
  text-align: center;
  font-size: 14px;
  color: #8d969b;
}
</style>
