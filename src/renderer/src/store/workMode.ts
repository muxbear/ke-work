import { defineStore } from 'pinia'
import { ref } from 'vue'

export type WorkMode = 'local' | 'cloud'

/**
 * 工作模式管理（渲染层）
 * 模式由主进程持久化（~/.ke-work/config/work-mode.json），此处经 IPC 同步
 */
export const useWorkModeStore = defineStore('workMode', () => {
  const mode = ref<WorkMode>('local')

  /** 应用启动时从主进程加载持久化模式 */
  async function loadMode(): Promise<void> {
    const result = await window.api.getWorkMode()
    if (result.success && result.data) {
      mode.value = result.data
    }
  }

  /**
   * 切换工作模式（经主进程联动 Agent/工厂）
   * @returns true=切换成功；false=失败（错误信息已抛出）
   */
  async function setMode(next: WorkMode): Promise<boolean> {
    const result = await window.api.setWorkMode(next)
    if (!result.success) {
      throw new Error(result.error ?? '切换工作模式失败')
    }
    mode.value = next
    return true
  }

  return { mode, loadMode, setMode }
})
