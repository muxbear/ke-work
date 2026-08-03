<script setup lang="ts">
import { ref } from 'vue'
import SettingToggle from '../SettingToggle.vue'

const pluginsDisabled = ref(false)
const agentsDisabled = ref(true)
const localMemoryEnabled = ref(true)
</script>

<template>
  <div class="s-page">
    <section class="s-card">
      <div class="s-row s-row--start">
        <div>
          <h2 class="s-sec-title">
            禁用全部插件
          </h2>
          <p class="s-desc s-desc--mt">
            开启后禁用全部技能、MCP 和插件。<br>
            <strong>当前状态：</strong>技能、MCP、插件可被正常使用。
          </p>
        </div>
        <SettingToggle v-model="pluginsDisabled" />
      </div>
    </section>
    <section class="s-card">
      <div class="s-row">
        <div>
          <h2 class="s-sec-title">
            禁用智能体团队
          </h2>
          <p class="s-desc s-desc--mt">
            禁用后，智能体不会自动组建团队来完成任务。当用户使用专家团时，团队能力仍会自动开启。
          </p>
        </div>
        <SettingToggle v-model="agentsDisabled" />
      </div>
    </section>
    <section class="s-card">
      <div class="s-row">
        <div>
          <h2 class="s-sec-title">
            本地技能与记忆沉淀
          </h2>
          <p class="s-desc s-desc--mt">
            自动记录本地记忆、工作日志，自动沉淀和优化技能。数据本地存储，仅在你的设备和工作区中保留。
          </p>
        </div>
        <SettingToggle v-model="localMemoryEnabled" />
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

.s-desc--mt {
  margin-top: 4px;
}

.s-desc {
  max-width: 820px;
  line-height: 1.5;
}
</style>
