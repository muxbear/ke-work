<script setup lang="ts">
import { computed, ref } from 'vue'
import SettingToggle from '../SettingToggle.vue'

const responseTone = ref('默认')
const welcomeMessage = ref(true)
const customInstructions = ref('')
const editingMemoryFile = ref('KeWork 的名字')

const instructionsLength = computed(() => customInstructions.value.length)

const memoryFiles = [
  {
    name: 'KeWork 对你的称呼',
    content: '- **What to call them:',
    empty: false,
  },
  {
    name: 'KeWork 的名字',
    content: '暂无内容，点击编辑添加',
    empty: true,
  },
  {
    name: 'KeWork 的人设 / 人格描述',
    content: "You're not a chatbot. You're becoming someone.\n\nCore Truths...",
    empty: false,
  },
  {
    name: 'KeWork 的长期记忆记录',
    content: '暂无内容，点击编辑添加',
    empty: true,
  },
]
</script>

<template>
  <div class="s-page">
    <!-- 基本风格和语调 -->
    <section class="s-sec-divider s-pad-bottom">
      <div class="s-row s-row--start">
        <div>
          <h2 class="s-sec-title">
            基本风格和语调
          </h2>
          <p class="s-desc s-desc--lg">
            设置 KeWork 回复你的风格和语调。这不会影响 KeWork 的功能。
          </p>
        </div>
        <div class="s-select-wrap s-shrink">
          <select
            v-model="responseTone"
            class="s-select s-select--tone"
          >
            <option>默认</option>
            <option>简洁</option>
            <option>专业</option>
            <option>友好</option>
          </select>
          <svg
            class="s-select-chevron"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
    </section>

    <!-- 加载过程欢迎语 -->
    <section class="s-sec-divider s-pad-block">
      <div class="s-row s-row--start">
        <div>
          <h2 class="s-sec-title">
            加载过程欢迎语
          </h2>
          <p class="s-desc s-desc--lg">
            在 KeWork 生成等待过程中展示辅助提示。关闭后可在这里重新打开。
          </p>
        </div>
        <SettingToggle
          v-model="welcomeMessage"
          size="sm"
        />
      </div>
    </section>

    <!-- 自定义指令 -->
    <section class="s-sec-divider s-pad-block">
      <h2 class="s-sec-title">
        自定义指令
      </h2>
      <p class="s-desc s-desc--lg">
        告诉 KeWork 你希望它始终遵循的规则和偏好，这会直接影响所有对话。
      </p>
      <textarea
        v-model="customInstructions"
        maxlength="1500"
        placeholder="例如: &quot;每次回答我之前都说 ok, 再接后续内容&quot;"
        class="s-textarea"
      />
      <div class="s-textarea-footer">
        <span>这些指令会应用于你的所有对话</span>
        <span>{{ instructionsLength }} / 1500</span>
      </div>
      <div class="s-confirm-row">
        <button class="s-confirm-btn">
          确认
        </button>
      </div>
    </section>

    <!-- 本地长期记忆文件 -->
    <section class="s-pad-top">
      <h2 class="s-sec-title">
        本地长期记忆文件
      </h2>
      <p class="s-desc s-desc--mt">
        以下 4 个文件存储在本地，你可直接编辑内容，也可由 KeWork 根据提示词自动更新。
      </p>
      <div class="s-memory-list">
        <article
          v-for="file in memoryFiles"
          :key="file.name"
          class="s-memory-card"
          :class="{ 's-memory-card--active': editingMemoryFile === file.name }"
        >
          <h3 class="s-sec-title">
            {{ file.name }}
          </h3>
          <div
            class="s-memory-content"
            :class="{ 's-memory-content--empty': file.empty }"
          >
            {{ file.content }}
          </div>
          <div class="s-memory-foot">
            <svg
              v-if="file.name.includes('人设') || file.name.includes('记录')"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M15 3h6v6" />
              <path d="M21 3l-7 7" />
              <path d="M9 21H3v-6" />
              <path d="m3 21 7-7" />
            </svg>
            <button
              class="s-edit-btn"
              @click="editingMemoryFile = file.name"
            >
              编辑
            </button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.s-page {
  max-width: 1060px;
  padding-bottom: 48px;
}

.s-desc--lg {
  margin-top: 8px;
  font-size: 14px;
}

.s-desc--mt {
  margin-top: 8px;
}

.s-pad-bottom {
  padding-bottom: 28px;
}

.s-pad-block {
  padding: 32px 0;
}

.s-pad-top {
  padding-top: 32px;
}

.s-shrink {
  flex-shrink: 0;
}

.s-select--tone {
  width: 125px;
  height: 40px;
  border-radius: 12px;
}

.s-select--tone + .s-select-chevron {
  right: 14px;
}

.s-textarea {
  width: 100%;
  height: 150px;
  margin-top: 16px;
  resize: none;
  border-radius: 12px;
  border: 1px solid #dfe3e4;
  background: #fff;
  padding: 16px;
  font-size: 14px;
  line-height: 1.6;
  color: #2d3438;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}

.s-textarea:focus {
  border-color: #0891b2;
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.12);
}

.s-textarea::placeholder {
  color: #b5babd;
}

.s-textarea-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  font-size: 13px;
  color: #b0b6ba;
}

.s-confirm-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 56px;
}

.s-confirm-btn {
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #0891b2, #0e7490);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 28px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.s-confirm-btn:hover {
  opacity: 0.9;
}

.s-memory-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}

.s-memory-card {
  border-radius: 16px;
  background: #fff;
  border: 1px solid #dfe3e4;
  padding: 20px;
  transition: border-color 0.15s ease;
}

.s-memory-card--active {
  border-color: #71777a;
}

.s-memory-content {
  margin-top: 16px;
  min-height: 42px;
  font-size: 13px;
  line-height: 1.6;
  color: #242a2e;
  white-space: pre-wrap;
}

.s-memory-content--empty {
  color: #b4b9bc;
}

.s-memory-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 12px;
  color: #515a60;
}

.s-edit-btn {
  border: 1px solid #dfe3e4;
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

.s-edit-btn:hover {
  background: #f4f7f7;
}
</style>
