<script setup lang="ts">
const openExternal = (url: string): void => {
  void window.api.openExternal(url)
}

const items = [
  { title: '帮助文档', icon: 'doc', external: true },
  { title: '意见反馈', icon: 'feedback', external: false },
  { title: '联系我们', icon: 'contact', external: true },
]
</script>

<template>
  <div class="s-page">
    <div class="s-list">
      <button
        v-for="item in items"
        :key="item.title"
        class="s-item"
        @click="openExternal('https://www.workbuddy.cn')"
      >
        <span class="s-item-name">
          <span class="s-item-icon">
            <!-- 帮助文档 -->
            <svg
              v-if="item.icon === 'doc'"
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
            <!-- 意见反馈 -->
            <svg
              v-else-if="item.icon === 'feedback'"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <!-- 联系我们 -->
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
          </span>
          {{ item.title }}
        </span>
        <svg
          v-if="item.external"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="s-external-icon"
        >
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      </button>
    </div>

    <div class="s-bottom-links">
      <button
        class="s-bottom-link"
        @click="openExternal('https://www.workbuddy.cn')"
      >
        隐私政策
      </button>
      <span class="s-sep">|</span>
      <button
        class="s-bottom-link"
        @click="openExternal('https://www.workbuddy.cn')"
      >
        服务协议
      </button>
    </div>
  </div>
</template>

<style scoped>
.s-page {
  max-width: 1060px;
  padding-bottom: 40px;
}

.s-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.s-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: 1px solid #f1f2f3;
  background: #f7f9fb;
  border-radius: 12px;
  padding: 16px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.s-item:hover {
  background: #f1f4f4;
}

.s-item-name {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  font-weight: 500;
  color: #22282c;
}

.s-item-icon {
  display: inline-flex;
  color: #515a60;
}

.s-external-icon {
  color: #6c757a;
}

.s-bottom-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
  font-size: 13px;
  color: #93999d;
}

.s-bottom-link {
  border: none;
  background: none;
  padding: 0;
  font-size: 13px;
  color: #93999d;
  cursor: pointer;
  transition: color 0.15s ease;
}

.s-bottom-link:hover {
  color: #5e666c;
}

.s-sep {
  color: #93999d;
}
</style>
