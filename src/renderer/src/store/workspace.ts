import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
// 渲染层 window.api 类型（preload 的全局声明）
import type { Workspace, WorkspaceFileContent, WorkspaceFileEntry } from '../../../preload/index.d'

/** localStorage 键：当前选中的工作空间 id（重启后恢复） */
const CURRENT_ID_KEY = 'ke-work.current-workspace-id'

/**
 * 工作空间状态管理
 * 工作空间 = 当前任务的工作文件夹；数据经 IPC 落库（主进程 workspaces 表）
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  // ====== 状态(State) ======
  const workspaces = ref<Workspace[]>([])
  const currentId = ref<string | null>(localStorage.getItem(CURRENT_ID_KEY))
  /** 上拉菜单中的搜索词 */
  const query = ref('')

  // ====== 计算属性(Getters) ======
  const currentWorkspace = computed(
    () => workspaces.value.find((w) => w.id === currentId.value) ?? null
  )

  const filteredWorkspaces = computed(() => {
    const keyword = query.value.trim().toLowerCase()
    if (!keyword) return workspaces.value
    return workspaces.value.filter((w) => w.name.toLowerCase().includes(keyword))
  })

  // ====== 方法(Actions) ======

  /** 持久化当前选中（localStorage，重启恢复） */
  function persistCurrentId(): void {
    if (currentId.value) {
      localStorage.setItem(CURRENT_ID_KEY, currentId.value)
    } else {
      localStorage.removeItem(CURRENT_ID_KEY)
    }
  }

  /** 从列表中删除工作空间（主进程仅删记录，磁盘文件夹保留）；失败抛错 */
  async function remove(id: string): Promise<void> {
    const result = await window.api.deleteWorkspace(id)
    if (!result.success) {
      throw new Error(result.error || '删除工作空间失败')
    }
    workspaces.value = workspaces.value.filter((w) => w.id !== id)
    if (currentId.value === id) {
      currentId.value = null
      persistCurrentId()
    }
  }

  /** 从主进程加载工作空间列表；currentId 失效（空间被删）则清空选中 */
  async function load(): Promise<void> {
    const result = await window.api.listWorkspaces()
    if (result.success && result.data) {
      workspaces.value = result.data
    }
    if (currentId.value && !workspaces.value.some((w) => w.id === currentId.value)) {
      currentId.value = null
      persistCurrentId()
    }
  }

  /** 选中一个工作空间（当前任务使用） */
  async function select(id: string): Promise<void> {
    if (!workspaces.value.some((w) => w.id === id)) return
    currentId.value = id
    persistCurrentId()
  }

  /** 新建工作空间（主进程在 ~/KeWork/ 下创建同名文件夹）；失败抛错（渲染层展示 error） */
  async function create(name: string): Promise<Workspace> {
    const result = await window.api.createWorkspace(name)
    if (!result.success || !result.data) {
      throw new Error(result.error || '新建工作空间失败')
    }
    workspaces.value.unshift(result.data)
    currentId.value = result.data.id
    persistCurrentId()
    return result.data
  }

  /** 打开本地文件夹作为工作空间；返回是否已选中（用户取消为 false） */
  async function selectExternal(): Promise<boolean> {
    const result = await window.api.selectWorkspaceDir()
    if (!result.success || !result.data) return false
    if (!workspaces.value.some((w) => w.id === result.data!.id)) {
      workspaces.value.unshift(result.data!)
    }
    currentId.value = result.data!.id
    persistCurrentId()
    return true
  }

  /** 不使用工作空间：~/KeWork/<YYYYMMDD-HHmmss> 时间戳目录 */
  async function useTimestamp(): Promise<void> {
    const result = await window.api.useTimestampWorkspace()
    if (!result.success || !result.data) {
      console.error('[workspace] useTimestamp failed:', result.error)
      return
    }
    if (!workspaces.value.some((w) => w.id === result.data!.id)) {
      workspaces.value.unshift(result.data!)
    }
    currentId.value = result.data!.id
    persistCurrentId()
  }

  /** 在系统资源管理器中打开工作空间目录 */
  async function open(id?: string): Promise<void> {
    const target = id ?? currentId.value
    if (!target) return
    await window.api.openWorkspace(target)
  }

  /** 列出工作空间下相对路径目录的条目（顶层传空串）；失败抛错（组件捕获展示） */
  async function listFiles(workspaceId: string, relPath?: string): Promise<WorkspaceFileEntry[]> {
    const result = await window.api.listWorkspaceFiles(workspaceId, relPath)
    if (!result.success || !result.data) {
      throw new Error(result.error || '读取目录失败')
    }
    return result.data
  }

  /** 读取工作空间下文件文本内容；失败抛错（组件捕获展示） */
  async function readFile(workspaceId: string, relPath: string): Promise<WorkspaceFileContent> {
    const result = await window.api.readWorkspaceFile(workspaceId, relPath)
    if (!result.success || !result.data) {
      throw new Error(result.error || '读取文件失败')
    }
    return result.data
  }

  return {
    workspaces,
    currentId,
    query,
    currentWorkspace,
    filteredWorkspaces,
    load,
    select,
    create,
    remove,
    selectExternal,
    useTimestamp,
    open,
    listFiles,
    readFile
  }
})
