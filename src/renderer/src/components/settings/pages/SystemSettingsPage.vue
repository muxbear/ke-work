<script setup lang="ts">
import { computed, onMounted } from 'vue'
import SettingToggle from '../SettingToggle.vue'
import { useSettingsStore, type SettingsKey } from '../../../store/settings'
import { formatBytes } from '../../../util/format'

const settingsStore = useSettingsStore()

/** 选项常量表（展示文案与存储枚举码解耦；存储码与主进程 schema 一致） */
const LANG_OPTIONS = [
  { value: 'zh-CN', label: '中文(简体)' },
  { value: 'zh-TW', label: '中文(繁體)' },
  { value: 'en', label: 'English' }
] as const
const PROXY_OPTIONS = [
  { value: 'direct', label: '直连（不使用代理）' },
  { value: 'system', label: '使用系统代理' },
  { value: 'manual', label: '手动配置代理' }
] as const
const SOUND_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'crisp', label: '清脆' },
  { value: 'soft', label: '柔和' }
] as const

/** 即时保存：离散值 change 即写库（store 内 300ms 防抖合并） */
function onToggle(key: SettingsKey, value: boolean): void {
  void settingsStore.set(key, value)
}
function onSelect(key: SettingsKey, value: string): void {
  void settingsStore.set(key, value)
}
function onFontSizeChange(): void {
  void settingsStore.set('ui.fontSize', settingsStore.fontSize)
}
function onProxyUrlChange(): void {
  void settingsStore.set('network.proxyUrl', settingsStore.proxyUrl)
}

/** 存储区块：占比与文案由真实统计计算 */
const stats = computed(() => settingsStore.storageStats)
const storagePercent = computed(() => {
  const s = stats.value
  if (!s || !s.diskTotal) return 0
  return Math.min((s.usedBytes / s.diskTotal) * 100, 100)
})
const storageSummary = computed(() => {
  const s = stats.value
  if (!s) return '统计中…'
  const pct = s.diskTotal ? ((s.usedBytes / s.diskTotal) * 100).toFixed(2) : '--'
  return `已用 ${formatBytes(s.usedBytes)}，占磁盘总空间 ${pct}%${s.partial ? '（统计中）' : ''}`
})
const diskUsedText = computed(() =>
  stats.value ? formatBytes(Math.max(stats.value.diskTotal - stats.value.diskFree, 0)) : '--'
)
const diskFreeText = computed(() => (stats.value ? formatBytes(stats.value.diskFree) : '--'))

function onOpenDataDir(): void {
  void window.api.openDataDir()
}
async function onChangeWorkspaceDir(): Promise<void> {
  try {
    await settingsStore.changeWorkspaceDir()
  } catch (err) {
    console.warn('[settings] change workspace dir failed:', err)
  }
}

onMounted(() => {
  void settingsStore.refreshStorageStats()
})
</script>

<template>
  <div class="s-page">
    <!-- 显示语言 -->
    <section class="s-card">
      <div class="s-row">
        <div>
          <h2 class="s-sec-title">
            显示语言
          </h2>
          <p class="s-desc s-desc--mt">
            设置应用程序界面的显示语言。
          </p>
        </div>
        <div class="s-select-wrap">
          <select
            :value="settingsStore.language"
            class="s-select s-select--lang"
            @change="onSelect('ui.language', ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="opt in LANG_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
          <svg
            class="s-select-chevron"
            width="14"
            height="14"
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

    <!-- 字体大小 -->
    <section class="s-card">
      <h2 class="s-sec-title">
        字体大小
      </h2>
      <div class="s-hairline" />
      <input
        v-model.number="settingsStore.fontSize"
        aria-label="字体大小"
        type="range"
        min="12"
        max="24"
        step="1"
        class="s-range"
        @change="onFontSizeChange"
      >
      <div class="s-range-labels">
        <span>小</span>
        <span class="s-range-labels--center">默认</span>
        <span>大</span>
      </div>
    </section>

    <!-- 开关组 -->
    <section class="s-card">
      <div class="s-row">
        <div>
          <h2 class="s-sec-title">
            技能自动更新
          </h2>
          <p class="s-desc s-desc--mt">
            开启后将自动更新已安装的技能为最新版本，不会更新你在 KeWork 中编辑过的技能
          </p>
          <span class="s-badge">该功能将在后续版本生效</span>
        </div>
        <SettingToggle
          :model-value="settingsStore.skillAutoUpdate"
          @update:model-value="onToggle('skills.autoUpdate', $event)"
        />
      </div>
    </section>
    <section class="s-card">
      <div class="s-row">
        <div>
          <h2 class="s-sec-title">
            套件自动更新
          </h2>
          <p class="s-desc s-desc--mt">
            开启后将自动更新已安装的套件为最新版本
          </p>
          <span class="s-badge">该功能将在后续版本生效</span>
        </div>
        <SettingToggle
          :model-value="settingsStore.pluginAutoUpdate"
          @update:model-value="onToggle('plugins.autoUpdate', $event)"
        />
      </div>
    </section>
    <section class="s-card">
      <div class="s-row">
        <div>
          <h2 class="s-sec-title">
            非高风险技能自动安装
          </h2>
          <p class="s-desc s-desc--mt">
            上传技能后仍会显示安全检测过程；检测结果为非高风险时自动继续安装，高风险始终需要手动确认。
          </p>
          <span class="s-badge">该功能将在后续版本生效</span>
        </div>
        <SettingToggle
          :model-value="settingsStore.safeSkillInstall"
          @update:model-value="onToggle('skills.safeInstall', $event)"
        />
      </div>
    </section>
    <section class="s-card">
      <div class="s-row">
        <div>
          <h2 class="s-sec-title">
            锁屏远程
          </h2>
          <p class="s-desc s-desc--mt">
            开启后即使在锁屏状态下，电脑也不会进入休眠、屏幕也不会自动关闭，方便通过手机远程操控和保持自动化任务持续进行。
          </p>
          <span class="s-badge">当前支持锁屏防休眠/防熄屏</span>
        </div>
        <SettingToggle
          :model-value="settingsStore.remoteLock"
          @update:model-value="onToggle('lockScreen.remoteLock', $event)"
        />
      </div>
    </section>

    <!-- 网络代理 -->
    <section class="s-card">
      <h2 class="s-sec-title">
        网络代理
      </h2>
      <p class="s-desc s-desc--mt">
        配置Ke-Work访问网络的方式。修改后立即生效，无需重启。
      </p>
      <div class="s-hairline" />
      <div class="s-proxy-row">
        <span class="s-proxy-label">代理模式</span>
        <div class="s-select-wrap">
          <select
            :value="settingsStore.proxyMode"
            class="s-select s-select--sm"
            @change="onSelect('network.proxyMode', ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="opt in PROXY_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
          <svg
            class="s-select-chevron"
            width="13"
            height="13"
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
      <!-- 手动配置代理：展开代理地址输入（新增） -->
      <div
        v-if="settingsStore.proxyMode === 'manual'"
        class="s-proxy-manual"
      >
        <input
          v-model="settingsStore.proxyUrl"
          class="s-input"
          placeholder="http://host:port"
          @change="onProxyUrlChange"
        >
        <p class="s-desc s-desc--mt">
          该代理仅作用于客户端网络请求；模型/云端通信的代理支持将在后续版本提供。
        </p>
      </div>
    </section>

    <!-- 存储 -->
    <h2 class="s-group-title">
      存储
    </h2>
    <p class="s-desc s-desc--mt">
      ~/.ke-work：存放任务对话记录和缓存等运行文件
    </p>
    <section class="s-card s-card--white">
      <div class="s-row">
        <h3 class="s-sec-title">
          ~/.ke-work 存储空间
        </h3>
        <span class="s-storage-used">{{ storageSummary }}</span>
      </div>
      <div class="s-progress">
        <div
          class="s-progress-fill"
          :style="{ width: storagePercent + '%' }"
        >
          <div class="s-progress-accent" />
        </div>
      </div>
      <div class="s-legend">
        <div class="s-legend-items">
          <span class="s-legend-item"><i class="s-dot s-dot--accent" />~/.ke-work 系统占用 {{ formatBytes(stats?.usedBytes ?? 0) }}</span>
          <span class="s-legend-item"><i class="s-dot s-dot--dark" />磁盘已用 {{ diskUsedText }}</span>
          <span class="s-legend-item"><i class="s-dot s-dot--light" />磁盘可用 {{ diskFreeText }}</span>
        </div>
        <div class="s-legend-actions">
          <button
            class="s-folder-btn"
            @click="onOpenDataDir"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
              />
            </svg>
            打开文件夹
          </button>
        </div>
      </div>
    </section>

    <p class="s-desc s-desc--mt">
      /KeWork：AI 生成产物的默认存储路径
    </p>
    <section class="s-card s-card--white">
      <h3 class="s-sec-title">
        /KeWork 默认工作空间存储路径
      </h3>
      <p class="s-desc s-desc--mt">
        新建任务、工作空间时将自动存放在该路径下；修改后不影响已有数据。
      </p>
      <div class="s-path-row">
        <input
          :value="settingsStore.meta?.workspaceBaseDir ?? ''"
          readonly
          class="s-input s-input--flex"
        >
        <button
          class="s-btn"
          @click="onChangeWorkspaceDir"
        >
          更改
        </button>
      </div>
    </section>

    <!-- 体验优化计划 -->
    <section class="s-card">
      <div class="s-row">
        <div>
          <h3 class="s-sec-title">
            体验优化计划
          </h3>
          <p class="s-desc s-desc--mt">
            允许我们使用您的数据进行模型优化，提升产品使用体验。我们将采取措施保护您的数据。
            <button class="s-link">
              了解更多
            </button>
          </p>
          <span class="s-badge">该功能将在后续版本生效</span>
        </div>
        <SettingToggle
          :model-value="settingsStore.experienceImprovement"
          @update:model-value="onToggle('privacy.experienceImprovement', $event)"
        />
      </div>
    </section>

    <!-- 通知 -->
    <h2 class="s-group-title">
      通知
    </h2>
    <section class="s-card">
      <div class="s-row">
        <div>
          <h3 class="s-sec-title">
            客户端通知
          </h3>
          <p class="s-desc s-desc--mt">
            运营消息优先端内送达，位于后台时自动转桌面通知。
          </p>
        </div>
        <SettingToggle
          :model-value="settingsStore.clientNotifications"
          @update:model-value="onToggle('notification.clientNotifications', $event)"
        />
      </div>
    </section>
    <section class="s-card">
      <div class="s-row">
        <div>
          <h3 class="s-sec-title">
            提示音设置
          </h3>
          <p class="s-desc s-desc--mt">
            桌面和客户端通知时的提示音风格
          </p>
        </div>
        <div class="s-select-wrap">
          <select
            :value="settingsStore.notificationSound"
            class="s-select s-select--lg"
            @change="onSelect('notification.sound', ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="opt in SOUND_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
          <svg
            class="s-select-chevron"
            width="14"
            height="14"
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

.s-select--lang {
  width: 186px;
}

.s-desc--mt {
  margin-top: 4px;
}

.s-hairline {
  height: 1px;
  background: #e7eaeb;
  margin: 10px 0;
}

.s-range {
  width: 100%;
  margin: 10px 0 4px;
  accent-color: #0891b2;
}

.s-range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #59636b;
}

.s-range-labels--center {
  margin-left: -28px;
}

.s-proxy-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.s-proxy-label {
  font-size: 14px;
  color: #59636b;
}

.s-proxy-manual {
  margin-top: 12px;
}

.s-group-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a2332;
  padding: 4px 4px 0;
}

.s-storage-used {
  font-size: 13px;
  color: #59636b;
}

.s-progress {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #eff1f1;
  margin: 16px 0;
}

.s-progress-fill {
  height: 100%;
  background: #111315;
  transition: width 0.3s ease;
}

.s-progress-accent {
  height: 100%;
  width: 6px;
  background: #06b6d4;
}

.s-legend {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #59636b;
}

.s-legend-items {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.s-legend-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.s-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.s-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
}

.s-dot--accent {
  background: #06b6d4;
}

.s-dot--dark {
  background: #111315;
}

.s-dot--light {
  background: #edf0f0;
}

.s-folder-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: #252b2f;
  cursor: pointer;
}

.s-path-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.s-input--flex {
  flex: 1;
}

/* pending 生效徽标（VS Code "Requires reload" 惯例本地化） */
.s-badge {
  display: inline-block;
  margin-top: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  color: #6b7280;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
}
</style>
