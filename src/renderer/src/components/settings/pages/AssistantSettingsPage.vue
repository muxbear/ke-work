<script setup lang="ts">
import { ref } from 'vue'
import SettingToggle from '../SettingToggle.vue'

const miniProgramEnabled = ref(true)
const autoSyncToMiniProgram = ref(false)
const autoStartConversation = ref(true)
const conversationIdleHours = ref('6')

const configuredChannels = ref<string[]>([])

const channels = [
  { name: '微信助理集成', tag: '推荐', desc: '通过微信扫码连接助理，接收和回复消息。' },
  { name: '微信客服号集成', desc: '注册微信客服号以接收和回复消息。' },
  { name: '企微助理集成', desc: '注册企微助理以接收和回复消息。' },
  { name: 'QQ 机器人集成', desc: '注册 QQ 机器人以接收和回复消息。' },
  { name: '飞书集成', desc: '注册飞书应用以通过飞书接收和回复消息。' },
  { name: '钉钉机器人集成', desc: '注册钉钉机器人以接收和回复消息。' },
  { name: '自动化任务企微 bot 推送集成', desc: '注册独立企微 bot，用于接收所有自动化任务结果通知。' },
]

const toggleChannel = (name: string): void => {
  if (configuredChannels.value.includes(name)) {
    configuredChannels.value = configuredChannels.value.filter((c) => c !== name)
  } else {
    configuredChannels.value = [...configuredChannels.value, name]
  }
}

/** 小程序码示意图的 49 个格子（0-48），对应设计稿的深浅方块布局 */
const qrDarkCells = [0, 1, 2, 7, 9, 14, 15, 16, 32, 33, 34, 39, 41, 46, 47, 48]
const qrCenterCell = 24
</script>

<template>
  <div class="s-page">
    <div class="s-beta-head">
      <h2 class="s-beta-title">
        集成（BETA）
      </h2>
      <button class="s-link">
        配置指南
      </button>
    </div>

    <!-- 微信小程序集成 -->
    <section class="s-card">
      <div class="s-row s-row--start">
        <div>
          <h3 class="s-sec-title">
            微信小程序集成
          </h3>
          <p class="s-desc s-desc--mt">
            接入微信小程序，用户可通过小程序与 AI 对话。
          </p>
        </div>
        <SettingToggle v-model="miniProgramEnabled" />
      </div>
      <div class="s-sync-row">
        <h3 class="s-sec-title">
          任务产物自动同步到小程序
        </h3>
        <SettingToggle v-model="autoSyncToMiniProgram" />
      </div>
      <!-- 小程序码示意图 -->
      <div
        class="s-qr"
        aria-label="微信小程序码示意图"
      >
        <span
          v-for="i in 49"
          :key="i"
          class="s-qr-cell"
          :class="{
            's-qr-cell--dark': qrDarkCells.includes(i - 1),
            's-qr-cell--accent': qrCenterCell === i - 1,
          }"
        />
        <div class="s-qr-center">
          Ke-Work
        </div>
      </div>
    </section>

    <!-- 集成渠道 -->
    <section
      v-for="channel in channels"
      :key="channel.name"
      class="s-card"
    >
      <div class="s-row">
        <div>
          <div class="s-channel-name">
            <h3 class="s-sec-title">
              {{ channel.name }}
            </h3>
            <span
              v-if="channel.tag"
              class="s-badge"
            >{{ channel.tag }}</span>
          </div>
          <p class="s-desc s-desc--mt">
            {{ channel.desc }}
          </p>
          <button class="s-guide-btn">
            配置指南
          </button>
        </div>
        <button
          class="s-config-btn"
          :class="{ 's-config-btn--done': configuredChannels.includes(channel.name) }"
          @click="toggleChannel(channel.name)"
        >
          {{ configuredChannels.includes(channel.name) ? '已配置' : '配置' }}
        </button>
      </div>
    </section>

    <!-- 会话管理 -->
    <h2 class="s-section-title">
      会话管理
    </h2>
    <section class="s-card">
      <div class="s-row s-row--start">
        <div>
          <h3 class="s-sec-title">
            自动新起会话
          </h3>
          <p class="s-desc s-desc--mt">
            超过设定时间未对话，自动开启新对话
          </p>
        </div>
        <SettingToggle v-model="autoStartConversation" />
      </div>
      <div class="s-idle-row">
        <span>超过</span>
        <input
          v-model="conversationIdleHours"
          type="number"
          min="1"
          class="s-idle-input"
        >
        <span>小时未对话，自动开启新会话</span>
      </div>
      <p class="s-tip">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6" />
          <path d="M10 22h4" />
        </svg>
        开启后，长时间未活跃的历史上下文将不再发送给模型，有效降低 Token 消耗并提升响应速度。
      </p>
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

.s-desc--mt {
  margin-top: 4px;
}

.s-beta-head {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-bottom: 4px;
}

.s-beta-title {
  font-size: 15px;
  font-weight: 600;
  color: #4e565b;
}

.s-sync-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 28px;
}

.s-qr {
  position: relative;
  width: 150px;
  height: 150px;
  margin: 20px auto 0;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(7, 1fr);
  gap: 4px;
  background: #fff;
  padding: 12px;
  box-sizing: border-box;
}

.s-qr-cell {
  border-radius: 2px;
  background: transparent;
}

.s-qr-cell--dark {
  background: #17191b;
}

.s-qr-cell--accent {
  background: #06b6d4;
}

.s-qr-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 5px solid #fff;
  background: #06b6d4;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.s-channel-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.s-guide-btn {
  margin-top: 8px;
  border: none;
  background: none;
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  color: #0891b2;
  cursor: pointer;
}

.s-guide-btn:hover {
  text-decoration: underline;
}

.s-config-btn {
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

.s-config-btn:hover {
  background: #f4f7f7;
}

.s-config-btn--done {
  background: rgba(8, 145, 178, 0.08);
  color: #0e7490;
}

.s-section-title {
  font-size: 15px;
  font-weight: 600;
  color: #4e565b;
  padding-top: 24px;
}

.s-idle-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 28px;
  font-size: 13px;
  color: #343b40;
}

.s-idle-input {
  width: 48px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid #d6dcde;
  background: #fff;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #343b40;
  outline: none;
  font-family: inherit;
}

.s-idle-input:focus {
  border-color: #0891b2;
}

.s-tip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 28px;
  font-size: 13px;
  line-height: 1.5;
  color: #697278;
}

.s-tip svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: #d3a72b;
}
</style>
