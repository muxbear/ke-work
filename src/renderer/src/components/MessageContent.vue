<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

/**
 * 消息内容渲染组件
 *
 * 支持多种内容类型的渲染，为未来格式扩展留出接口。
 *
 * 扩展方式：新增 contentType 值，添加对应的渲染逻辑分支。
 * 未来可重构为 plugin 注册模式：
 *   const renderers: Record<string, ContentRenderer> = { ... }
 */

export interface MessageContentProps {
  content: string
  contentType?: 'markdown' | 'text' | 'html'
}

const props = withDefaults(defineProps<MessageContentProps>(), {
  contentType: 'markdown'
})

const renderedHtml = computed(() => {
  if (!props.content) return ''

  switch (props.contentType) {
    case 'markdown':
      return marked.parse(props.content, { async: false }) as string
    case 'html':
      // 预留：未来可在此处添加 XSS 过滤（如 DOMPurify.sanitize）
      return props.content
    case 'text':
    default:
      // 纯文本：转义 HTML 并保留换行
      return props.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
  }
})
</script>

<template>
  <div
    v-if="contentType === 'markdown' || contentType === 'html'"
    class="message-content message-content--rich"
    v-html="renderedHtml"
  ></div>
  <div v-else class="message-content message-content--text" v-html="renderedHtml"></div>
</template>

<style>
/* ═══════════════════════════════════════════════════════════════════════════
   Markdown Content Styles (unscoped — applies to v-html rendered content)
   ═══════════════════════════════════════════════════════════════════════════ */
.message-content--rich {
  line-height: 1.7;
  word-break: break-word;
}

.message-content--rich h1,
.message-content--rich h2,
.message-content--rich h3,
.message-content--rich h4,
.message-content--rich h5,
.message-content--rich h6 {
  margin: 16px 0 8px;
  font-weight: 600;
  line-height: 1.4;
  color: #1a2332;
}

.message-content--rich h1 { font-size: 1.4em; }
.message-content--rich h2 { font-size: 1.25em; }
.message-content--rich h3 { font-size: 1.1em; }

.message-content--rich p {
  margin: 8px 0;
}

.message-content--rich p:first-child {
  margin-top: 0;
}

.message-content--rich p:last-child {
  margin-bottom: 0;
}

.message-content--rich ul,
.message-content--rich ol {
  margin: 8px 0;
  padding-left: 20px;
}

.message-content--rich li {
  margin: 4px 0;
}

.message-content--rich code {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(8, 145, 178, 0.08);
  color: #0e7490;
  font-size: 0.9em;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
}

.message-content--rich pre {
  margin: 12px 0;
  padding: 14px 16px;
  border-radius: 10px;
  background: #1a2332;
  overflow-x: auto;
}

.message-content--rich pre code {
  padding: 0;
  background: transparent;
  color: #e2e8f0;
  font-size: 0.85em;
  line-height: 1.6;
}

.message-content--rich blockquote {
  margin: 12px 0;
  padding: 8px 14px;
  border-left: 3px solid #0891b2;
  background: rgba(8, 145, 178, 0.04);
  border-radius: 0 8px 8px 0;
  color: #4b5563;
}

.message-content--rich table {
  margin: 12px 0;
  border-collapse: collapse;
  width: 100%;
  font-size: 0.9em;
}

.message-content--rich th,
.message-content--rich td {
  padding: 8px 12px;
  border: 1px solid rgba(8, 145, 178, 0.15);
  text-align: left;
}

.message-content--rich th {
  background: rgba(8, 145, 178, 0.06);
  font-weight: 600;
  color: #1a2332;
}

.message-content--rich td {
  color: #374151;
}

.message-content--rich a {
  color: #0891b2;
  text-decoration: none;
}

.message-content--rich a:hover {
  text-decoration: underline;
}

.message-content--rich strong {
  font-weight: 600;
  color: #1a2332;
}

.message-content--rich hr {
  margin: 16px 0;
  border: none;
  border-top: 1px solid rgba(8, 145, 178, 0.12);
}

.message-content--rich img {
  max-width: 100%;
  border-radius: 8px;
}

/* Plain text mode */
.message-content--text {
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
