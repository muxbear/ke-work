<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** 提供商 logo 标识（providers 数据 logo 字段；deepseek=鲸鱼，其余品牌色+字符） */
  logo: string
  size?: number
}>()

/** 品牌底色（与提供商 logo 标识对应） */
const BRAND_COLORS: Record<string, string> = {
  deepseek: '#3d5afe',
  zhipu: '#3b5bdb',
  moonshot: '#fa5252',
  minimax: '#12b886',
  xiaomi: '#ff922b',
  aliyun: '#fd7e14',
  tencent: '#228be6',
  bytedance: '#ff5c38',
  custom: '#868e96'
}

/** 非图形 LOGO 的提供商用白色字符（首字/缩写） */
const CHARS: Record<string, string> = {
  zhipu: '智',
  minimax: 'M',
  xiaomi: '米',
  aliyun: '通',
  tencent: '混',
  bytedance: '豆',
  custom: '＋'
}

const bg = computed(() => BRAND_COLORS[props.logo] ?? '#868e96')
const char = computed(() => CHARS[props.logo] ?? props.logo.slice(0, 1).toUpperCase())
const size = computed(() => props.size ?? 24)
</script>

<template>
  <span
    class="pl-logo"
    :style="{ width: `${size}px`, height: `${size}px`, background: bg }"
  >
    <!-- DeepSeek：鲸鱼剪影（品牌 LOGO） -->
    <svg
      v-if="logo === 'deepseek'"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3 13.5C3 9 6.9 5.5 12 5.5c2.9 0 5.4 1.1 7.1 2.9.4-.3.9-.4 1.4-.4 1.5 0 2.5 1 2.5 2.2 0 1.2-1 2.2-2.5 2.2-.9 0-1.7-.3-2.4-.9-.9 1.5-2.4 2.5-4.1 2.5-2.8 0-5-2-5.3-4.6-.8 2-2.3 3.1-4.1 3.1H3z" />
      <path d="M16.2 6.4l3.8-2.4c.5-.3 1.1.1.9.7l-1 2.5-3.7-.8z" />
      <circle
        cx="6"
        cy="11.2"
        r="1"
        fill="transparent"
        stroke="currentColor"
        stroke-width="0.9"
      />
    </svg>
    <!-- 月之暗面：弯月 -->
    <svg
      v-else-if="logo === 'moonshot'"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
    <span
      v-else
      class="pl-char"
      :style="{ fontSize: `${size * 0.5}px` }"
    >{{ char }}</span>
  </span>
</template>

<style scoped>
.pl-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  color: #fff;
  overflow: hidden;
}

.pl-logo svg {
  width: 72%;
  height: 72%;
}

.pl-char {
  line-height: 1;
  font-weight: 600;
  user-select: none;
}
</style>
