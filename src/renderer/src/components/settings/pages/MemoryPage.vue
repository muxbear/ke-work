<script setup lang="ts">
import { ref } from 'vue'
import SettingToggle from '../SettingToggle.vue'

const conversationMemory = ref(true)
const memoryImported = ref(false)
</script>

<template>
  <div class="s-page">
    <p class="s-intro">
      记忆让 WorkBuddy 记住你的偏好和习惯，对话越多，它就越懂你。记忆内容遵循
      <button class="s-link">
        WorkBuddy 隐私政策
      </button>
      ，仅你本人可见。
    </p>

    <!-- 生成对话记忆 -->
    <section class="s-sec-divider s-pad-block">
      <div class="s-row s-row--start">
        <div>
          <h2 class="s-sec-title">
            生成对话记忆
          </h2>
          <p class="s-desc s-desc--lg">
            允许 WorkBuddy 从对话中提取并记住相关上下文，以便在未来对话中提供更连贯、个性化的回应。
          </p>
        </div>
        <SettingToggle v-model="conversationMemory" />
      </div>
      <div class="s-memory-box">
        <p class="s-memory-status">
          {{ conversationMemory ? '暂无记忆内容' : '对话记忆已暂停' }}
        </p>
        <div class="s-memory-meta">
          <h3 class="s-sec-title">
            来自对话的记忆
          </h3>
          <p class="s-memory-time">
            {{ conversationMemory ? '刚刚从对话中更新' : '不会自动更新' }}
          </p>
        </div>
      </div>
    </section>

    <!-- 从其他AI导入记忆 -->
    <section class="s-row s-row--start s-pad-top">
      <div>
        <h2 class="s-sec-title">
          从其他AI导入记忆
        </h2>
        <p class="s-desc s-desc--lg">
          一键同步你在其他AI上的使用习惯。
        </p>
        <p
          v-if="memoryImported"
          class="s-imported"
        >
          已导入一份记忆内容。
        </p>
      </div>
      <button
        class="s-import-btn"
        @click="memoryImported = true"
      >
        导入
      </button>
    </section>
  </div>
</template>

<style scoped>
.s-page {
  max-width: 1060px;
  padding-bottom: 48px;
}

.s-intro {
  font-size: 14px;
  line-height: 1.6;
  color: #5e666c;
  padding-bottom: 20px;
  border-bottom: 1px solid #dfe3e4;
}

.s-desc--lg {
  margin-top: 4px;
  font-size: 14px;
}

.s-pad-block {
  padding: 28px 0;
}

.s-pad-top {
  padding-top: 28px;
}

.s-memory-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #dfe3e4;
  padding: 16px 24px;
}

.s-memory-status {
  font-size: 14px;
  color: #59636b;
}

.s-memory-meta {
  text-align: right;
}

.s-memory-time {
  margin-top: 4px;
  font-size: 13px;
  color: #2e80c4;
}

.s-import-btn {
  flex-shrink: 0;
  border: none;
  background: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 14px;
  font-weight: 500;
  color: #20272b;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.s-import-btn:hover {
  background: #f4f6f6;
}

.s-imported {
  margin-top: 12px;
  font-size: 13px;
  color: #0891b2;
}
</style>
