<script setup lang="ts">
defineProps<{
  modelValue: boolean
  size?: 'md' | 'sm'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :class="['s-toggle', { 's-toggle--on': modelValue, 's-toggle--sm': size === 'sm' }]"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="s-toggle-dot" />
  </button>
</template>

<style scoped>
/* 通用开关（设置窗口专用，开态青色） */
.s-toggle {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: #e5e7eb;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: background-color 0.2s ease;
  flex-shrink: 0;
  position: relative;
  display: inline-flex;
  align-items: center;
}

.s-toggle-dot {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transform: translateX(4px);
  transition: transform 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

.s-toggle--on {
  background: #0891b2;
}

.s-toggle--on .s-toggle-dot {
  transform: translateX(24px);
}

/* 小尺寸（个性化页「加载过程欢迎语」） */
.s-toggle--sm {
  width: 32px;
  height: 20px;
}

.s-toggle--sm .s-toggle-dot {
  width: 14px;
  height: 14px;
  transform: translateX(3px);
}

.s-toggle--sm.s-toggle--on .s-toggle-dot {
  transform: translateX(15px);
}
</style>
