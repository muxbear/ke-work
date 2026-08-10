<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useModelStore } from '@store/models'
import type { CustomModel } from '../../../../../preload/index.d'
import ProviderLogo from './ProviderLogo.vue'

/** 需要用户填写 API 地址的提供方式 */
const CUSTOM_URL_PLANS = ['自定义 API', '其它']

const props = defineProps<{
  open: boolean
  /** 编辑模式：非 null 时预填该模型并更新（模型 id 不可改） */
  editing?: CustomModel | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const modelStore = useModelStore()

/** 窗口可见性：由父组件 open prop 驱动，保证关闭时有退出动画 */
const visible = ref(props.open)
watch(
  () => props.open,
  (v) => {
    visible.value = v
  }
)

// ── 表单状态 ──
const providerId = ref('')
const providerOpen = ref(false)
const planType = ref('')
const apiUrl = ref('')
const apiKey = ref('')
const showApiKey = ref(false)
const modelName = ref('')
const modelSearch = ref('')
const pickerOpen = ref(false)
const error = ref('')
const saving = ref(false)

const currentProvider = computed(
  () => modelStore.providers.find((p) => p.id === providerId.value) ?? null
)

/** 提供方式是否需要用户填写 API 地址（Token/Coding Plan 用提供商默认端点） */
const needCustomUrl = computed(() => CUSTOM_URL_PLANS.includes(planType.value))

/** 模型名称候选：当前提供商可提供的模型（来自 models.json providers 数据，可手改） */
const filteredCandidates = computed(() => {
  const list = currentProvider.value?.models ?? []
  const q = modelSearch.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((m) => m.toLowerCase().includes(q))
})

/**
 * 打开弹窗时重置表单：新建模式取首个提供商；编辑模式按原模型预填
 * （提供商匹配 vendor；端点与默认端点一致 → 托管方式，否则 → 自定义 API）
 */
const resetForm = (): void => {
  const editing = props.editing
  if (editing) {
    // 编辑模式：提供商按 vendor 匹配（找不到 → 其它 + 自定义 API）
    const provider = modelStore.providers.find((p) => p.name === editing.vendor)
    providerId.value = provider?.id ?? 'custom'
    const plan = provider?.plans[0]
    const usesDefault = provider !== undefined && editing.url === provider.defaultUrl
    if (provider && plan && usesDefault) {
      planType.value = plan.type
      apiUrl.value = ''
    } else {
      planType.value = provider ? '自定义 API' : '其它'
      apiUrl.value = editing.url
    }
    apiKey.value = editing.apiKey
    modelName.value = editing.id
    showApiKey.value = false
  } else {
    const first = modelStore.providers[0]
    providerId.value = first?.id ?? ''
    planType.value = first?.plans[0]?.type ?? ''
    apiUrl.value = ''
    apiKey.value = ''
    modelName.value = ''
  }
  modelSearch.value = ''
  pickerOpen.value = false
  providerOpen.value = false
  error.value = ''
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      // 弹窗打开时确保提供商数据就绪（模型页首次进入可能尚未加载）
      if (modelStore.providers.length === 0) void modelStore.load()
      resetForm()
    }
  }
)

const toggleProvider = (): void => {
  providerOpen.value = !providerOpen.value
}

/** 选择提供商：重置提供方式为该提供商首个 plan，并预填默认端点 */
const pickProvider = (id: string): void => {
  providerId.value = id
  onProviderChange()
  providerOpen.value = false
}

/** 切换提供商（编辑模式预填路径）：重置提供方式与端点，关闭模型选择器 */
const onProviderChange = (): void => {
  const provider = currentProvider.value
  if (!provider) return
  planType.value = provider.plans[0]?.type ?? ''
  apiUrl.value = ''
  pickerOpen.value = false
}

/** 切换提供方式：自定义方式清空端点，托管方式回填提供商默认端点 */
const onPlanChange = (): void => {
  const provider = currentProvider.value
  if (!provider) return
  apiUrl.value = needCustomUrl.value ? '' : (provider.defaultUrl ?? '')
}

const toggleApiKey = (): void => {
  showApiKey.value = !showApiKey.value
}

const togglePicker = (): void => {
  pickerOpen.value = !pickerOpen.value
  if (pickerOpen.value) modelSearch.value = ''
}

const pickModel = (name: string): void => {
  modelName.value = name
  pickerOpen.value = false
}

const closeModal = (): void => {
  pickerOpen.value = false
  emit('close')
}

/** 保存：本地校验 → modelStore.add/update（主进程权威校验）→ 成功关闭弹窗 */
const saveModel = async (): Promise<void> => {
  if (saving.value) return
  error.value = ''
  const provider = currentProvider.value
  if (!provider) return
  const name = modelName.value.trim()
  if (!name) {
    error.value = '请输入模型名称'
    return
  }
  if (!apiKey.value.trim()) {
    error.value = '请输入 API Key'
    return
  }
  const url = needCustomUrl.value ? apiUrl.value.trim() : (provider.defaultUrl ?? '').trim()
  if (!url) {
    error.value = '请输入 API 地址'
    return
  }
  saving.value = true
  try {
    const input = {
      id: name,
      name,
      vendor: provider.name,
      url,
      apiKey: apiKey.value.trim()
    }
    if (props.editing) {
      // 编辑模式：id 不可改，其余字段更新
      await modelStore.update(props.editing.id, input)
    } else {
      await modelStore.add(input)
    }
    emit('saved')
    closeModal()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败，请重试'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Transition name="am-modal">
    <div
      v-if="visible"
      class="am-mask"
      @click.self="closeModal"
    >
      <div class="am-card">
        <!-- 头部 -->
        <div class="am-header">
          <div class="am-header-left">
            <h2 class="am-title">
              {{ editing ? '编辑模型' : '添加模型' }}
            </h2>
            <span class="am-badge">仅支持 OpenAI 兼容协议 API</span>
          </div>
          <button
            class="am-close"
            aria-label="关闭添加模型"
            @click="closeModal"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line
                x1="18"
                y1="6"
                x2="6"
                y2="18"
              />
              <line
                x1="6"
                y1="6"
                x2="18"
                y2="18"
              />
            </svg>
          </button>
        </div>

        <!-- 表单 -->
        <div class="am-body">
          <!-- 提供商（LOGO + 中文名 / 英文名） -->
          <div class="am-field">
            <div class="am-label-row">
              <label class="am-label">提供商</label>
              <button class="am-doc-link">
                查看文档
              </button>
            </div>
            <div class="am-provider">
              <button
                class="am-provider-btn"
                @click="toggleProvider"
              >
                <span class="am-provider-btn-main">
                  <ProviderLogo
                    v-if="currentProvider"
                    :logo="currentProvider.logo"
                    :size="24"
                  />
                  <span class="am-provider-btn-name">
                    {{ currentProvider?.name ?? '' }}<template v-if="currentProvider?.nameEn">
                      / {{ currentProvider.nameEn }}
                    </template>
                  </span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <Transition name="dropdown">
                <div
                  v-if="providerOpen"
                  class="am-provider-dropdown"
                >
                  <button
                    v-for="p in modelStore.providers"
                    :key="p.id"
                    class="am-provider-option"
                    :class="{ 'am-provider-option--active': p.id === providerId }"
                    @click="pickProvider(p.id)"
                  >
                    <ProviderLogo
                      :logo="p.logo"
                      :size="22"
                    />
                    <span class="am-provider-option-text">
                      {{ p.name }}<template v-if="p.nameEn"> / {{ p.nameEn }}</template>
                    </span>
                    <svg
                      v-if="p.id === providerId"
                      class="am-provider-option-check"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                </div>
              </Transition>
            </div>
          </div>

          <!-- 提供方式 -->
          <div class="am-field">
            <label class="am-label">提供方式</label>
            <div class="am-select-wrap">
              <select
                v-model="planType"
                class="am-select am-select--plain"
                @change="onPlanChange"
              >
                <option
                  v-for="plan in currentProvider?.plans ?? []"
                  :key="plan.type"
                  :value="plan.type"
                >
                  {{ plan.type }}
                </option>
              </select>
              <svg
                class="am-select-icon-right"
                width="16"
                height="16"
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

          <!-- API 地址（自定义 API / 其它 时展开） -->
          <div
            v-if="needCustomUrl"
            class="am-field"
          >
            <label class="am-label">API 地址</label>
            <input
              v-model="apiUrl"
              class="am-input"
              placeholder="https://api.example.com/v1/chat/completions"
            >
          </div>

          <!-- API Key -->
          <div class="am-field">
            <label class="am-label">API Key</label>
            <div class="am-input-wrap">
              <input
                v-model="apiKey"
                :type="showApiKey ? 'text' : 'password'"
                class="am-input am-input--with-eye"
                placeholder="输入你的 API Key"
              >
              <button
                class="am-eye"
                aria-label="切换 API Key 可见性"
                @click="toggleApiKey"
              >
                <svg
                  v-if="!showApiKey"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle
                    cx="12"
                    cy="12"
                    r="3"
                  />
                </svg>
                <svg
                  v-else
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line
                    x1="2"
                    y1="2"
                    x2="22"
                    y2="22"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- 模型名称 -->
          <div class="am-field">
            <label class="am-label">模型名称</label>
            <div class="am-picker">
              <button
                class="am-picker-btn"
                @click="togglePicker"
              >
                <span :class="{ 'am-picker-placeholder': !modelName }">
                  {{ modelName || '选择或输入模型名称' }}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <Transition name="dropdown">
                <div
                  v-if="pickerOpen"
                  class="am-picker-dropdown"
                >
                  <div class="am-picker-search">
                    <svg
                      class="am-picker-search-icon"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle
                        cx="11"
                        cy="11"
                        r="8"
                      />
                      <line
                        x1="21"
                        y1="21"
                        x2="16.65"
                        y2="16.65"
                      />
                    </svg>
                    <input
                      v-model="modelSearch"
                      class="am-picker-input"
                      placeholder="输入模型参数值，例如 deepseek-v4-flash 或 gpt-4o"
                    >
                  </div>
                  <div class="am-picker-list">
                    <button
                      v-for="m in filteredCandidates"
                      :key="m"
                      class="am-picker-option"
                      @click="pickModel(m)"
                    >
                      <span>{{ m }}</span>
                      <svg
                        v-if="modelName === m"
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button
                      v-if="modelSearch.trim() && filteredCandidates.length === 0"
                      class="am-picker-option"
                      @click="pickModel(modelSearch.trim())"
                    >
                      <span>使用输入值：{{ modelSearch.trim() }}</span>
                    </button>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <p
            v-if="error"
            class="am-error"
          >
            {{ error }}
          </p>
        </div>

        <!-- 底部 -->
        <div class="am-footer">
          <button
            class="am-btn-cancel"
            @click="closeModal"
          >
            取消
          </button>
          <button
            class="am-btn-save"
            :disabled="saving"
            @click="saveModel"
          >
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ═══════════════════ 添加模型弹窗（对齐 Figma 设计稿精确规格） ═══════════════════ */
.am-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(2, 6, 23, 0.35);
}

.am-card {
  width: 100%;
  max-width: 700px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.24);
  overflow: hidden;
}

/* 头部 */
.am-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #e8eaeb;
}

.am-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.am-title {
  font-size: 18px;
  font-weight: 600;
  color: #171b1f;
}

.am-badge {
  padding: 4px 10px;
  border-radius: 999px;
  background: #f6f7f8;
  font-size: 14px;
  color: #5e666c;
}

.am-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #59636b;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.am-close:hover {
  background: #f2f4f4;
}

/* 表单 */
.am-body {
  padding: 20px 24px;
}

.am-field + .am-field {
  margin-top: 16px;
}

.am-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.am-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #4f575c;
}

.am-label-row .am-label {
  margin-bottom: 0;
}

.am-doc-link {
  border: none;
  background: none;
  padding: 0;
  font-size: 14px;
  color: #1685c4;
  cursor: pointer;
}

.am-doc-link:hover {
  text-decoration: underline;
}

.am-select-wrap {
  position: relative;
}

.am-select {
  width: 100%;
  height: 40px;
  padding: 0 36px 0 40px;
  border: 1px solid #dfe3e4;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  font-family: inherit;
  color: #262d31;
  outline: none;
  appearance: none;
  cursor: pointer;
}

.am-select--plain {
  padding-left: 12px;
}

.am-select-icon-left {
  position: absolute;
  left: 12px;
  top: 11px;
  color: #11a7ee;
  pointer-events: none;
}

.am-select-icon-right {
  position: absolute;
  right: 12px;
  top: 12px;
  color: #59636b;
  pointer-events: none;
}

/* 提供商自定义下拉（LOGO + 中文名 / 英文名） */
.am-provider {
  position: relative;
}

.am-provider-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #dfe3e4;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  font-family: inherit;
  color: #262d31;
  text-align: left;
  cursor: pointer;
}

.am-provider-btn > svg {
  color: #59636b;
  flex-shrink: 0;
}

.am-provider-btn-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.am-provider-btn-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.am-provider-dropdown {
  position: absolute;
  z-index: 10;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid #dfe3e4;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
}

.am-provider-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: #4d555a;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.am-provider-option:hover {
  background: #f5f7f7;
}

.am-provider-option--active {
  color: #262d31;
  font-weight: 500;
}

.am-provider-option-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.am-provider-option-check {
  color: #00b992;
  flex-shrink: 0;
}

/* 输入框（API Key / API 地址） */
.am-input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #dfe3e4;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  font-family: inherit;
  color: #262d31;
  outline: none;
  box-sizing: border-box;
}

.am-input::placeholder {
  color: #9ca3a7;
}

.am-input:focus {
  border-color: #1685c4;
}

.am-input--with-eye {
  padding-right: 40px;
}

.am-input-wrap {
  position: relative;
}

.am-eye {
  position: absolute;
  right: 8px;
  top: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  color: #4f575c;
  cursor: pointer;
}

/* 模型名称选择器 */
.am-picker {
  position: relative;
}

.am-picker-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #dfe3e4;
  border-radius: 8px;
  background: #f4f5f5;
  font-size: 14px;
  font-family: inherit;
  color: #262d31;
  text-align: left;
  cursor: pointer;
}

.am-picker-btn svg {
  color: #59636b;
  flex-shrink: 0;
}

.am-picker-placeholder {
  color: #9ca3a7;
}

/* 向上展开（模型名称在表单底部，向下会被弹窗底部裁剪；上方空间充足） */
.am-picker-dropdown {
  position: absolute;
  z-index: 10;
  bottom: calc(100% + 4px);
  left: 0;
  width: 100%;
  overflow: hidden;
  border: 1px solid #dfe3e4;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
}

.am-picker-search {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e8eaeb;
}

.am-picker-search-icon {
  margin-left: 10px;
  color: #3f474c;
  flex-shrink: 0;
}

.am-picker-input {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border: none;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: #262d31;
  outline: none;
}

.am-picker-input::placeholder {
  color: #92999e;
}

.am-picker-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px 0;
}

.am-picker-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: #4d555a;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.am-picker-option:hover {
  background: #f5f7f7;
}

.am-picker-option svg {
  color: #00b992;
  flex-shrink: 0;
}

/* 错误提示 */
.am-error {
  margin-top: 12px;
  font-size: 13px;
  color: #ce4545;
}

/* 底部按钮 */
.am-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e8eaeb;
}

.am-btn-cancel {
  padding: 8px 20px;
  border: 1px solid #dfe3e4;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  color: #343b40;
  cursor: pointer;
}

.am-btn-save {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: #17191b;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  color: #fff;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.am-btn-save:hover {
  opacity: 0.85;
}

.am-btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 弹层动画（对齐设置窗口：遮罩 0.18s 淡入，卡片回弹缩放） */
.am-modal-enter-active,
.am-modal-leave-active {
  transition: opacity 0.18s ease;
}

.am-modal-enter-active .am-card,
.am-modal-leave-active .am-card {
  transition: transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.am-modal-enter-from,
.am-modal-leave-to {
  opacity: 0;
}

.am-modal-enter-from .am-card,
.am-modal-leave-to .am-card {
  transform: scale(0.98) translateY(10px);
}

/* 模型下拉展开动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
