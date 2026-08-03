<script setup lang="ts">
import { ref } from 'vue'

const managedDataItem = ref<string | null>(null)

const items = [
  { name: '我分享的文件', icon: 'file' },
  { name: '我分享的任务', icon: 'share' },
  { name: '我发布的应用', icon: 'app' },
  { name: '已归档任务', icon: 'archive' },
]
</script>

<template>
  <div class="s-page">
    <section
      v-for="item in items"
      :key="item.name"
      class="s-card"
    >
      <div class="s-row">
        <div class="s-item-name">
          <span class="s-item-icon">
            <!-- 我分享的文件 -->
            <svg
              v-if="item.icon === 'file'"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              <path d="M10 9H8" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
            </svg>
            <!-- 我分享的任务 -->
            <svg
              v-else-if="item.icon === 'share'"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle
                cx="18"
                cy="5"
                r="3"
              />
              <circle
                cx="6"
                cy="12"
                r="3"
              />
              <circle
                cx="18"
                cy="19"
                r="3"
              />
              <path d="m8.59 13.51 6.83 3.98" />
              <path d="m15.41 6.51-6.82 3.98" />
            </svg>
            <!-- 我发布的应用 -->
            <svg
              v-else-if="item.icon === 'app'"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect
                width="7"
                height="9"
                x="3"
                y="3"
                rx="1"
              />
              <rect
                width="7"
                height="5"
                x="14"
                y="3"
                rx="1"
              />
              <rect
                width="7"
                height="9"
                x="14"
                y="12"
                rx="1"
              />
              <rect
                width="7"
                height="5"
                x="3"
                y="16"
                rx="1"
              />
            </svg>
            <!-- 已归档任务 -->
            <svg
              v-else
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
              />
            </svg>
          </span>
          <span>{{ item.name }}</span>
        </div>
        <button
          class="s-manage-btn"
          @click="managedDataItem = item.name"
        >
          {{ managedDataItem === item.name ? '已打开' : '管理' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.s-page {
  max-width: 1060px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 32px;
}

.s-item-name {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  font-weight: 500;
  color: #202629;
}

.s-item-icon {
  display: inline-flex;
  color: #4f575d;
}

.s-manage-btn {
  flex-shrink: 0;
  border: 1px solid #f0f1f2;
  background: #fff;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #24292d;
  cursor: pointer;
  transition: background-color 0.15s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.s-manage-btn:hover {
  background: #f4f7f7;
}
</style>
