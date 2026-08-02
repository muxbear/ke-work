<script setup lang="ts">
// 文件内容预览：纯 <pre> 插值渲染（Vue 自动 HTML 转义，杜绝 XSS）
defineProps<{
  name: string
  relPath: string
  content: string
  truncated: boolean
}>()

defineEmits<{ (e: 'back'): void }>()
</script>

<template>
  <div class="fp">
    <div class="fp-head">
      <button class="fp-back" title="返回列表" @click="$emit('back')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <div class="fp-title">
        <p class="fp-name">{{ name }}</p>
        <p class="fp-path">{{ relPath }}</p>
      </div>
    </div>
    <p v-if="truncated" class="fp-truncated">文件较大，仅显示前 200KB</p>
    <div class="fp-body">
      <pre class="fp-code">{{ content }}</pre>
    </div>
  </div>
</template>

<style scoped>
.fp {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.fp-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(8, 145, 178, 0.1);
  flex-shrink: 0;
}

.fp-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s ease;
}

.fp-back:hover {
  background: rgba(8, 145, 178, 0.1);
  color: #0e7490;
}

.fp-title {
  flex: 1;
  min-width: 0;
}

.fp-name {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #1a2332;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fp-path {
  margin: 2px 0 0;
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fp-truncated {
  margin: 0;
  padding: 6px 12px;
  font-size: 11px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.08);
  border-bottom: 1px solid rgba(245, 158, 11, 0.15);
  flex-shrink: 0;
}

.fp-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.fp-code {
  margin: 0;
  padding: 12px;
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #334155;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
