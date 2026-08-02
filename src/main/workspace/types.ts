/**
 * 工作空间来源：
 * - created：用户在应用内"新建工作空间"（~/KeWork/<name>）
 * - external：用户"打开本地文件夹"选择的任意目录
 * - timestamp：选择"不使用工作空间"时按当前时间自动创建的目录
 */
export type WorkspaceSource = 'created' | 'external' | 'timestamp'

/** 工作空间记录（workspaces 表行） */
export interface WorkspaceRow {
  id: string
  name: string
  path: string
  source: WorkspaceSource
  createdAt: number
}
