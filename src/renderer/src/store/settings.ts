import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 系统设置存储 key（与主进程 settings/schema.ts 对齐；嵌套路径扁平化） */
export type SettingsKey =
  | 'ui.language'
  | 'ui.fontSize'
  | 'skills.autoUpdate'
  | 'skills.safeInstall'
  | 'plugins.autoUpdate'
  | 'lockScreen.remoteLock'
  | 'network.proxyMode'
  | 'network.proxyUrl'
  | 'workspace.defaultWorkspaceDir'
  | 'privacy.experienceImprovement'
  | 'notification.clientNotifications'
  | 'notification.sound'

export type Language = 'zh-CN' | 'zh-TW' | 'en'
export type ProxyMode = 'direct' | 'system' | 'manual'
export type NotificationSound = 'none' | 'crisp' | 'soft'

interface SettingsMeta {
  dataBaseDir: string
  workspaceBaseDir: string
}

interface StorageStats {
  baseDir: string
  usedBytes: number
  diskTotal: number
  diskFree: number
  partial?: boolean
}

/** 渲染层首帧默认值（与主进程 schema 一致；load() 后以主进程为准） */
const DEFAULT_FONT_SIZE = 17

/**
 * 系统设置（渲染层，对齐 workMode.ts 的 "store ↔ IPC 同步" 范本）
 * - load：App 挂载后调用，主进程默认值合并快照回填 12 字段 + 应用运行时效果
 * - set：乐观更新 → 300ms 防抖合并 → IPC → 失败回滚（重新 load）
 * - 即时生效：字体缩放 webFrame.setZoomFactor（语言 i18n P2 接入）
 */
export const useSettingsStore = defineStore('settings', () => {
  const language = ref<Language>('zh-CN')
  const fontSize = ref(DEFAULT_FONT_SIZE)
  const skillAutoUpdate = ref(true)
  const pluginAutoUpdate = ref(true)
  const safeSkillInstall = ref(false)
  const remoteLock = ref(false)
  const proxyMode = ref<ProxyMode>('direct')
  const proxyUrl = ref('')
  const defaultWorkspaceDir = ref('')
  const experienceImprovement = ref(true)
  const clientNotifications = ref(true)
  const notificationSound = ref<NotificationSound>('none')

  const meta = ref<SettingsMeta>()
  const storageStats = ref<StorageStats | null>(null)
  const loaded = ref(false)

  /** key → 响应式字段 映射（set/load 统一入口；主进程已校验，此处直接强转） */
  function applyToField(key: string, value: unknown): void {
    switch (key) {
      case 'ui.language':
        language.value = value as Language
        break
      case 'ui.fontSize':
        fontSize.value = value as number
        break
      case 'skills.autoUpdate':
        skillAutoUpdate.value = value as boolean
        break
      case 'skills.safeInstall':
        safeSkillInstall.value = value as boolean
        break
      case 'plugins.autoUpdate':
        pluginAutoUpdate.value = value as boolean
        break
      case 'lockScreen.remoteLock':
        remoteLock.value = value as boolean
        break
      case 'network.proxyMode':
        proxyMode.value = value as ProxyMode
        break
      case 'network.proxyUrl':
        proxyUrl.value = value as string
        break
      case 'workspace.defaultWorkspaceDir':
        defaultWorkspaceDir.value = value as string
        break
      case 'privacy.experienceImprovement':
        experienceImprovement.value = value as boolean
        break
      case 'notification.clientNotifications':
        clientNotifications.value = value as boolean
        break
      case 'notification.sound':
        notificationSound.value = value as NotificationSound
        break
    }
  }

  /** 运行时效果：字体缩放（经 preload 的 webFrame.setZoomFactor 封装，默认 17 → 1.0；语言 i18n 同步 P2 接入） */
  function applyRuntimeEffects(): void {
    window.api.setZoomFactor(fontSize.value / DEFAULT_FONT_SIZE)
  }

  /** 从主进程加载全部设置（App 挂载后调用；失败保留首帧默认值） */
  async function load(): Promise<void> {
    const result = await window.api.getAllSettings()
    if (!result.success || !result.data) {
      console.warn('[settings] load failed:', result.error)
      return
    }
    const { settings, meta: snapshotMeta } = result.data
    for (const [key, value] of Object.entries(settings)) {
      applyToField(key, value)
    }
    meta.value = snapshotMeta
    loaded.value = true
    applyRuntimeEffects()
  }

  /** 写入待防抖队列（key 级：同一 key 连续写只落最后值） */
  const pendingWrites = new Map<string, unknown>()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function flushWrites(): Promise<void> {
    const writes = [...pendingWrites.entries()]
    pendingWrites.clear()
    for (const [key, value] of writes) {
      const result = await window.api.setSetting(key, value)
      if (!result.success) {
        console.warn(`[settings] set ${key} failed:`, result.error)
        await load() // 失败回滚：以主进程为准重新拉取
        return
      }
    }
  }

  /**
   * 修改设置：乐观更新本地 + 运行时效果 → 300ms 防抖合并 → IPC 持久化
   * @throws 主进程校验失败时抛错（调用方展示）
   */
  async function set(key: SettingsKey, value: unknown): Promise<void> {
    applyToField(key, value)
    pendingWrites.set(key, value)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void flushWrites()
    }, 300)
    applyRuntimeEffects()
  }

  /** 刷新 ~/.ke-work 存储统计（打开设置页时调用） */
  async function refreshStorageStats(): Promise<void> {
    const result = await window.api.getStorageStats()
    if (result.success && result.data) {
      storageStats.value = result.data
    }
  }

  /** 系统目录选择对话框更改默认工作空间路径（非空则保存并同步 meta） */
  async function changeWorkspaceDir(): Promise<void> {
    const result = await window.api.selectDefaultWorkspaceDir()
    if (!result.success) throw new Error(result.error ?? '选择目录失败')
    if (result.data) {
      defaultWorkspaceDir.value = result.data
      if (meta.value) meta.value.workspaceBaseDir = result.data
    }
  }

  return {
    language,
    fontSize,
    skillAutoUpdate,
    pluginAutoUpdate,
    safeSkillInstall,
    remoteLock,
    proxyMode,
    proxyUrl,
    defaultWorkspaceDir,
    experienceImprovement,
    clientNotifications,
    notificationSound,
    meta,
    storageStats,
    loaded,
    load,
    set,
    refreshStorageStats,
    changeWorkspaceDir
  }
})
