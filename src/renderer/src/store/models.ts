import { defineStore } from 'pinia'
import { ref } from 'vue'
// 渲染层 window.api 类型（preload 的全局声明；node tsconfig 下需此处显式合并）
import type { KeWorkWindowApi } from '../../../preload/index.d'
import type { CustomModel, ModelProvider } from '../../../preload/index.d'

declare global {
  interface Window {
    api: KeWorkWindowApi
  }
}

/**
 * 自定义模型状态管理（机器级配置，直连 IPC）
 * 添加模型是低频模态操作（弹窗等结果才关闭），不做乐观更新/回滚；
 * 失败由调用方（弹窗/页面）展示错误。ModelPage 与聊天页共享本 store，增删后下拉天然同步。
 */
export const useModelStore = defineStore('models', () => {
  const models = ref<CustomModel[]>([])
  const providers = ref<ModelProvider[]>([])
  const loaded = ref(false)

  /** 加载模型与提供商列表（失败静默保留旧值，避免启动期无 IPC 可用时崩溃） */
  async function load(): Promise<void> {
    const [m, p] = await Promise.all([
      window.api.listModels(),
      window.api.listModelProviders()
    ])
    if (m.success && m.data) models.value = m.data
    if (p.success && p.data) providers.value = p.data
    loaded.value = true
  }

  /** 添加模型：成功 push 进列表并返回记录；失败抛错（弹窗展示 error） */
  async function add(input: {
    id: string
    name: string
    vendor: string
    url: string
    apiKey: string
  }): Promise<CustomModel> {
    const result = await window.api.addModel(input)
    if (!result.success || !result.data) throw new Error(result.error || '添加模型失败')
    models.value.push(result.data)
    return result.data
  }

  /** 移除模型：成功从列表删除；失败抛错 */
  async function remove(id: string): Promise<void> {
    const result = await window.api.removeModel(id)
    if (!result.success) throw new Error(result.error || '移除模型失败')
    models.value = models.value.filter((m) => m.id !== id)
  }

  /** 更新模型：成功替换列表项；失败抛错 */
  async function update(
    id: string,
    input: { id: string; name: string; vendor: string; url: string; apiKey: string }
  ): Promise<CustomModel> {
    const result = await window.api.updateModel(id, input)
    if (!result.success || !result.data) throw new Error(result.error || '更新模型失败')
    const idx = models.value.findIndex((m) => m.id === id)
    if (idx !== -1) models.value[idx] = result.data
    return result.data
  }

  return { models, providers, loaded, load, add, update, remove }
})
