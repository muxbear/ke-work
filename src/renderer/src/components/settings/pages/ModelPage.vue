<script setup lang="ts">
import { ref } from 'vue'

const customModels = ref<string[]>([])

const addModel = (): void => {
  if (customModels.value.length === 0) customModels.value = ['本地自定义模型']
}

const removeModel = (): void => {
  customModels.value = []
}
</script>

<template>
  <div class="s-page">
    <h2 class="s-page-title">
      自定义模型
    </h2>
    <section class="s-card">
      <div class="s-row s-row--start">
        <div>
          <h3 class="s-sec-title">
            本地配置文件
          </h3>
          <p class="s-desc s-desc--mt">
            管理写入到 <button class="s-link">
              %USERPROFILE%\.ke-work\models.json
            </button> 的本地自定义模型配置。
          </p>
        </div>
        <button
          class="s-add-btn"
          @click="addModel"
        >
          ＋ 添加模型
        </button>
      </div>
    </section>

    <h2 class="s-section-title">
      已保存模型
    </h2>
    <div
      v-if="customModels.length === 0"
      class="s-empty"
    >
      <h3 class="s-sec-title">
        还没有配置自定义模型
      </h3>
      <p class="s-desc s-desc--mt">
        添加后会自动写入本地 models.json，并出现在聊天模型下拉的“自定义模型”分组中。
      </p>
    </div>
    <div
      v-else
      class="s-model-list"
    >
      <div
        v-for="model in customModels"
        :key="model"
        class="s-card"
      >
        <div class="s-row">
          <div>
            <h3 class="s-sec-title">
              {{ model }}
            </h3>
            <p class="s-desc s-desc--mt">
              已保存至本地 models.json
            </p>
          </div>
          <button
            class="s-remove-btn"
            @click="removeModel"
          >
            移除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.s-page {
  max-width: 1060px;
  padding-bottom: 48px;
}

.s-page-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a2332;
  margin-bottom: 16px;
}

.s-desc--mt {
  margin-top: 4px;
}

.s-add-btn {
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

.s-add-btn:hover {
  background: #f4f7f7;
}

.s-section-title {
  font-size: 15px;
  font-weight: 600;
  color: #4e565b;
  margin: 44px 0 16px;
}

.s-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 128px;
  text-align: center;
  border: 1px dashed #d9dddf;
  border-radius: 8px;
  background: #fcfcfc;
}

.s-model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.s-remove-btn {
  border: none;
  background: none;
  font-size: 13px;
  color: #59636b;
  cursor: pointer;
  transition: color 0.15s ease;
}

.s-remove-btn:hover {
  color: #ce4545;
}
</style>
