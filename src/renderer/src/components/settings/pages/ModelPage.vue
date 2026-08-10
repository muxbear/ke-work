<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useModelStore } from '@store/models'
import type { CustomModel } from '../../../../../preload/index.d'
import AddModelModal from './AddModelModal.vue'

const modelStore = useModelStore()

const addOpen = ref(false)
/** 正在编辑的模型（null = 新建模式） */
const editingModel = ref<CustomModel | null>(null)

onMounted(() => {
  void modelStore.load()
})

/** 打开添加模型弹窗（新建模式） */
const openAddModal = (): void => {
  editingModel.value = null
  addOpen.value = true
}

/** 打开编辑弹窗（预填模型数据） */
const editModel = (model: CustomModel): void => {
  editingModel.value = model
  addOpen.value = true
}

/** 关闭添加模型弹窗 */
const closeAddModal = (): void => {
  addOpen.value = false
  editingModel.value = null
}

/** 删除模型（本地 models.json，可直接再添加，不做二次确认） */
const removeModel = async (id: string): Promise<void> => {
  try {
    await modelStore.remove(id)
  } catch (err) {
    console.error('[ModelPage] removeModel failed:', err)
  }
}
</script>

<template>
  <div class="m-page">
    <h2 class="m-page-title">
      自定义模型
    </h2>
    <section class="m-card">
      <div class="m-card-row">
        <div class="m-card-main">
          <h3 class="m-card-title">
            本地配置文件
          </h3>
          <p class="m-card-desc">
            管理写入到
            <span class="m-file-path">%USERPROFILE%\.ke-work\models.json</span>
            的本地自定义模型配置。
          </p>
        </div>
        <button
          class="m-add-btn"
          @click="openAddModal"
        >
          ＋ 添加模型
        </button>
      </div>
    </section>

    <h2 class="m-section-title">
      已保存模型
    </h2>
    <div
      v-if="modelStore.models.length === 0"
      class="m-empty"
    >
      <h3 class="m-empty-title">
        还没有配置自定义模型
      </h3>
      <p class="m-empty-desc">
        添加后会自动写入本地 models.json，并出现在聊天模型下拉的“自定义模型”分组中。
      </p>
    </div>
    <div
      v-else
      class="m-model-list"
    >
      <div
        v-for="model in modelStore.models"
        :key="model.id"
        class="m-card m-card--item"
      >
        <div class="m-card-row">
          <div class="m-card-main">
            <h3 class="m-card-title">
              {{ model.name }}
            </h3>
            <p class="m-card-desc">
              已保存至本地 models.json
            </p>
          </div>
          <div class="m-item-actions">
            <button
              class="m-icon-btn"
              aria-label="编辑模型"
              title="编辑"
              @click="editModel(model)"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
            <button
              class="m-icon-btn m-icon-btn--danger"
              aria-label="删除模型"
              title="删除"
              @click="removeModel(model.id)"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <AddModelModal
      :open="addOpen"
      :editing="editingModel"
      @close="closeAddModal"
    />
  </div>
</template>

<style scoped>
/* ═══════════════════ 模型页（对齐 Figma 设计稿精确规格；m- 前缀局部类，不动 s-* 共享体系） ═══════════════════ */
.m-page {
  max-width: 1060px;
  padding-bottom: 48px;
}

.m-page-title {
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: #14181b;
}

.m-card {
  padding: 16px;
  border: 1px solid #f1f2f3;
  border-radius: 12px;
  background: #f8f9fa;
}

.m-card--item {
  padding: 14px 16px;
}

.m-card-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.m-card-main {
  min-width: 0;
}

.m-card-title {
  font-size: 16px;
  font-weight: 600;
  color: #171b1f;
}

.m-card-desc {
  margin-top: 4px;
  font-size: 14px;
  color: #606970;
}

.m-file-path {
  font-size: 14px;
  color: #1685c4;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.m-add-btn {
  flex-shrink: 0;
  padding: 8px 16px;
  border: 1px solid #f0f1f2;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  color: #24292d;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.m-add-btn:hover {
  background: #f4f7f7;
}

.m-section-title {
  margin: 44px 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: #4e565b;
}

.m-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 128px;
  border: 1px dashed #d9dddf;
  border-radius: 8px;
  background: #fcfcfc;
  text-align: center;
}

.m-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: #171b1f;
}

.m-empty-desc {
  margin-top: 8px;
  font-size: 14px;
  color: #606970;
}

.m-model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.m-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.m-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #59636b;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.m-icon-btn:hover {
  background: #eef1f2;
  color: #171b1f;
}

.m-icon-btn--danger:hover {
  background: #fdeeee;
  color: #ce4545;
}
</style>
