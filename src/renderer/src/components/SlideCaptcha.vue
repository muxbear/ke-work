<template>
  <div class="captcha-mask" @click.self="close">
    <div class="captcha-panel">
      <button type="button" class="close-button" @click="close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <p class="captcha-title">安全验证</p>
      <p class="captcha-desc">向右拖动滑块至末端完成验证</p>

      <div
        class="captcha-track"
        ref="trackRef"
        :class="{ 'track--success': status === 'success', 'track--error': status === 'error' }"
      >
        <div class="captcha-fill" :style="fillStyle" :class="{ 'fill--success': status === 'success', 'fill--error': status === 'error' }"></div>
        <div class="captcha-center-text">
          {{ status === 'success' ? '验证成功' : status === 'error' ? '请重新拖动' : '向右拖动滑块' }}
        </div>
        <div
          class="captcha-thumb"
          ref="thumbRef"
          :style="thumbStyle"
          :class="{ 'thumb--success': status === 'success', 'thumb--error': status === 'error' }"
          @pointerdown="onPointerDown"
          @touchstart.prevent="onTouchStart"
        >
          <svg v-if="status === 'success'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      <button class="captcha-refresh" @click="reset">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        刷新
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const emit = defineEmits<{
  (e: 'verified'): void
  (e: 'close'): void
}>()

const thumbRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)
const dragging = ref(false)
const position = ref(0)
const status = ref<'idle' | 'success' | 'error'>('idle')
const startX = ref(0)
const maxMove = ref(0)

const thumbStyle = computed(() => ({
  transform: `translateX(${position.value}px)`
}))

const fillStyle = computed(() => ({
  width: `${Math.max(0, position.value)}px`
}))

const close = () => {
  emit('close')
  reset()
}

const reset = () => {
  position.value = 0
  status.value = 'idle'
  dragging.value = false
}

const onPointerDown = (event: PointerEvent) => {
  if (!thumbRef.value || !trackRef.value || status.value === 'success') return
  event.preventDefault()
  dragging.value = true
  status.value = 'idle'
  startX.value = event.clientX
  maxMove.value = trackRef.value.clientWidth - thumbRef.value.clientWidth
  thumbRef.value.setPointerCapture(event.pointerId)
}

const onTouchStart = (event: TouchEvent) => {
  if (!thumbRef.value || !trackRef.value || status.value === 'success') return
  dragging.value = true
  status.value = 'idle'
  startX.value = event.touches[0].clientX
  maxMove.value = trackRef.value.clientWidth - thumbRef.value.clientWidth
}

const onPointerMove = (event: PointerEvent) => {
  if (!dragging.value || !trackRef.value) return
  const delta = event.clientX - startX.value
  position.value = Math.min(Math.max(delta, 0), maxMove.value)
}

const onTouchMove = (event: TouchEvent) => {
  if (!dragging.value || !trackRef.value) return
  const delta = event.touches[0].clientX - startX.value
  position.value = Math.min(Math.max(delta, 0), maxMove.value)
}

const onPointerUp = () => {
  if (!dragging.value) return
  dragging.value = false
  const tolerance = 8
  if (position.value >= maxMove.value - tolerance) {
    status.value = 'success'
    position.value = maxMove.value
    window.setTimeout(() => emit('verified'), 500)
  } else {
    status.value = 'error'
    window.setTimeout(reset, 600)
  }
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onPointerUp)
})
</script>

<style scoped>
.captcha-mask {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 1000;
}

.captcha-panel {
  width: min(360px, 90vw);
  background: #ffffff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 24px 60px rgba(8, 145, 178, 0.12);
  position: relative;
}

.close-button {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #9ca3af;
  transition: color 0.15s ease;
  padding: 4px;
}

.close-button:hover {
  color: #6b7280;
}

.captcha-title {
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 4px;
}

.captcha-desc {
  text-align: center;
  font-size: 12px;
  color: #6b7f95;
  margin: 0 0 16px;
}

/* Track */
.captcha-track {
  position: relative;
  height: 44px;
  border-radius: 22px;
  background: #f0f6fa;
  border: 1px solid rgba(8, 145, 178, 0.2);
  overflow: hidden;
  user-select: none;
  margin-bottom: 12px;
}

.track--success {
  background: #ecfdf5;
  border-color: #6ee7b7;
}

.track--error {
  background: #fef2f2;
  border-color: #fca5a5;
}

/* Fill */
.captcha-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 22px;
  background: linear-gradient(90deg, rgba(8, 145, 178, 0.1), rgba(8, 145, 178, 0.25));
  transition: width 0.3s ease;
}

.fill--success {
  background: linear-gradient(90deg, #d1fae5, #6ee7b7);
}

.fill--error {
  background: linear-gradient(90deg, #fee2e2, #fecaca);
}

/* Center text */
.captcha-center-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: #6b7f95;
  pointer-events: none;
}

.track--success .captcha-center-text {
  color: #059669;
}

.track--error .captcha-center-text {
  color: #dc2626;
}

/* Thumb */
.captcha-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0891b2, #0e7490);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  cursor: grab;
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.3);
  z-index: 1;
}

.thumb--success {
  background: linear-gradient(135deg, #10b981, #059669);
}

.thumb--error {
  background: linear-gradient(135deg, #f87171, #dc2626);
}

/* Refresh button */
.captcha-refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin: 0 auto;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  font-family: inherit;
  transition: color 0.15s ease;
}

.captcha-refresh:hover {
  color: #6b7280;
}
</style>
