import { existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { extname, isAbsolute, join, resolve, sep } from 'path'
import { homedir } from 'os'
import type { WorkspaceRepository } from './WorkspaceRepository'
import type { WorkspaceRow } from './types'
import { loadFileText } from './FileLoaders'

/** 文件列表条目（relPath 统一用 '/' 分隔的相对路径，渲染层据此缩进与回传） */
export interface WorkspaceFileEntry {
  name: string
  type: 'dir' | 'file'
  relPath: string
}

/** 文件读取结果：truncated 表示超过大小上限被截断 */
export interface WorkspaceFileContent {
  content: string
  truncated: boolean
}

/** 列表/预览时忽略的隐藏与依赖目录 */
const HIDDEN_NAMES = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  '.idea',
  '.vscode',
  '.DS_Store'
])
/** 单层最多返回条目数 */
const MAX_LIST_ITEMS = 200

/** 默认工作空间：未选择任何空间时的兜底目录（记录机器级共享，user_id 恒为 NULL） */
const DEFAULT_WS_NAME = '默认工作空间'
const DEFAULT_WS_DIR = 'DefaultWorkspace'

/** 工作空间名称规则（Windows 目录名约束的超集，跨平台一致） */
const NAME_MAX_LEN = 50
/** 非法字符：路径分隔符与 Windows 保留字符 */
const INVALID_CHARS = /[\\/:*?"<>|]/
/** 首尾点/空格（Windows 目录规则：目录名不能以点或空格结尾） */
const EDGE_DOTS_SPACES = /^[.\s]|[.\s]$/
/** Windows 保留设备名（大小写不敏感） */
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

/** 工作空间外部依赖（可注入以便纯 node 单测） */
export interface WorkspaceServiceDeps {
  /** 打开系统目录选择窗口，返回所选目录绝对路径；取消返回 null */
  selectDir?: () => Promise<string | null>
  /** 在系统资源管理器中打开目录 */
  openPath?: (p: string) => Promise<void>
}

/**
 * 工作空间业务服务
 *
 * 工作空间 = 任务的工作文件夹，存放在系统家目录的 KeWork/ 下（external 来源除外）。
 * 所有目录创建/校验集中在主进程，渲染层只传 id/name，防路径注入。
 */
export class WorkspaceService {
  private keWorkBaseDir: string

  constructor(
    private readonly repo: WorkspaceRepository,
    keWorkBaseDir: string = join(homedir(), 'KeWork'),
    private readonly deps: WorkspaceServiceDeps = {}
  ) {
    this.keWorkBaseDir = keWorkBaseDir
  }

  /**
   * 修改工作空间基址（系统设置"默认工作空间存储路径"更改后调用）。
   * 不迁移已有 workspaces 表记录与磁盘目录——仅影响新建工作空间的落点，
   * 符合"修改后不影响已有数据"文案承诺。
   */
  setBaseDir(dir: string): void {
    this.keWorkBaseDir = dir
    console.log(`[workspace] base dir changed to: ${dir}`)
  }

  /** 当前生效的工作空间基址（供设置页/装配读取真实值） */
  getBaseDir(): string {
    return this.keWorkBaseDir
  }

  /**
   * 当前用户的工作空间（含机器级共享的默认空间；默认空间记录/目录不存在时自动创建）
   */
  list(userId: string): WorkspaceRow[] {
    this.ensureDefaultWorkspace()
    return this.repo.listForUser(userId)
  }

  /**
   * 默认工作空间：<基址>/DefaultWorkspace，机器级唯一（记录 user_id 为 NULL，所有用户共享）
   * - 当前基址下已存在记录 → 收敛历史遗留的多余默认记录后返回
   * - 存在旧基址留下的默认记录（改过"存储路径"）→ 迁移其 path 跟随新基址（id 不变，绑定不失效）
   * - 完全不存在 → 创建目录并入库
   */
  ensureDefaultWorkspace(): WorkspaceRow {
    const dir = join(this.keWorkBaseDir, DEFAULT_WS_DIR)
    const existing = this.repo.findByPath(dir)
    if (existing) {
      // 改基址曾产生的重复默认记录（仅删记录，磁盘目录保留）
      this.repo.removeOtherDefaults(existing.id)
      return existing
    }
    const otherDefault = this.repo.findDefaultSource()
    if (otherDefault) {
      console.log(`[workspace] migrate default workspace: ${otherDefault.path} -> ${dir}`)
      mkdirSync(dir, { recursive: true })
      this.repo.updatePath(otherDefault.id, dir)
      this.repo.removeOtherDefaults(otherDefault.id)
      return { ...otherDefault, path: dir }
    }
    mkdirSync(dir, { recursive: true })
    console.log(`[workspace] created default directory: ${dir}`)
    return this.repo.create({ name: DEFAULT_WS_NAME, path: dir, source: 'default', userId: null })
  }

  /**
   * 新建工作空间：校验名字 → 在家目录 KeWork/ 下创建同名文件夹 → 入库
   * @throws 名字非法 / 目录已存在时抛错（渲染层展示 message）
   */
  createWorkspace(name: string, userId: string): WorkspaceRow {
    const safe = this.sanitizeName(name)
    const dir = join(this.keWorkBaseDir, safe)
    if (existsSync(dir)) {
      throw new Error(`工作空间已存在：${safe}`)
    }
    mkdirSync(dir, { recursive: true })
    console.log(`[workspace] created directory: ${dir}`)
    return this.repo.create({ name: safe, path: dir, source: 'created', userId })
  }

  /**
   * 打开本地文件夹：系统目录选择 → 入库（source: external）
   * 重复选择的目录：默认空间直接复用；无主记录先接管；他人记录拒绝
   * 用户取消返回 null
   */
  async selectExternalDir(userId: string): Promise<WorkspaceRow | null> {
    if (!this.deps.selectDir) throw new Error('目录选择功能不可用')
    const dir = await this.deps.selectDir()
    if (!dir) return null
    const existing = this.repo.findByPath(dir)
    if (existing) {
      if (existing.source === 'default') return existing
      if (existing.userId === null) {
        this.repo.adoptByPath(dir, userId)
        return { ...existing, userId }
      }
      if (existing.userId !== userId) {
        throw new Error('该目录已被其他用户登记为工作空间')
      }
      return existing
    }
    const name = this.basename(dir)
    return this.repo.create({ name, path: dir, source: 'external', userId })
  }

  /**
   * 校验工作空间可删除（不存在 / 默认空间抛错；不落库，供 workspace:delete 级联删除前守卫）
   */
  assertDeletable(id: string, userId: string): void {
    const ws = this.repo.getById(id, userId)
    if (!ws) throw new Error('工作空间不存在')
    if (ws.source === 'default') throw new Error('默认工作空间不可删除')
  }

  /**
   * 从列表中删除工作空间（仅删记录，不删除磁盘文件夹——避免误删用户数据；默认空间不可删）
   * 业务表绑定的会话由 workspace:delete handler 级联删除；仅 metadata 绑定的旧会话随记录删除后归默认空间
   */
  deleteWorkspace(id: string, userId: string): void {
    this.assertDeletable(id, userId)
    if (this.repo.delete(id, userId) === 0) throw new Error('工作空间不存在')
    console.log(`[workspace] deleted workspace record: ${id}`)
  }

  /** 在系统资源管理器中打开工作空间目录（只接受表内本人 id） */
  async openWorkspace(id: string, userId: string): Promise<void> {
    const ws = this.repo.getById(id, userId)
    if (!ws) throw new Error('工作空间不存在')
    // 默认空间打开其基址（设置"默认工作空间存储路径"配置值，两处保持一致）；
    // 普通空间打开各自目录
    const target = ws.source === 'default' ? this.keWorkBaseDir : ws.path
    if (!existsSync(target)) throw new Error('工作空间目录不存在')
    if (!this.deps.openPath) throw new Error('打开目录功能不可用')
    await this.deps.openPath(target)
  }

  /**
   * 解析工作空间为 Agent 运行参数：id 存在且目录在磁盘上 → { id, name, dir }
   * 目录被删除等异常场景返回 null（调用方回退默认目录）
   */
  resolveWorkspace(id: string, userId: string): { id: string; name: string; dir: string } | null {
    const ws = this.repo.getById(id, userId)
    if (!ws || !existsSync(ws.path)) return null
    return { id: ws.id, name: ws.name, dir: ws.path }
  }

  /**
   * 列出工作空间下相对路径目录的条目（顶层传 ''）
   * @throws 工作空间不存在 / 路径越界 / 目标不是目录时抛错
   */
  listFiles(id: string, userId: string, relPath = ''): WorkspaceFileEntry[] {
    const ws = this.resolveWorkspace(id, userId)
    if (!ws) throw new Error('工作空间不存在或目录已移除')
    const target = this.resolveInside(ws.dir, relPath)
    if (!statSync(target).isDirectory()) throw new Error('不是目录')

    const entries = readdirSync(target, { withFileTypes: true })
      .filter((d) => !HIDDEN_NAMES.has(d.name))
      .map((d) => {
        const entryPath = [relPath, d.name].filter(Boolean).join('/')
        return { name: d.name, type: d.isDirectory() ? ('dir' as const) : ('file' as const), relPath: entryPath }
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .slice(0, MAX_LIST_ITEMS)
    return entries
  }

  /**
   * 读取工作空间下文件文本内容（按扩展名分发文本加载器）
   * @throws 工作空间不存在 / 路径越界 / 不是文件 / 二进制（未知扩展名）时抛错
   */
  async readFile(id: string, userId: string, relPath: string): Promise<WorkspaceFileContent> {
    const ws = this.resolveWorkspace(id, userId)
    if (!ws) throw new Error('工作空间不存在或目录已移除')
    const target = this.resolveInside(ws.dir, relPath)
    if (!statSync(target).isFile()) throw new Error('不是文件')
    const ext = extname(target).toLowerCase().replace(/^\./, '')
    return loadFileText(target, ext)
  }

  /**
   * 解析工作空间内相对路径并做 containment 校验（防路径穿越）
   * @throws 绝对路径 / 越界时抛错
   */
  private resolveInside(root: string, relPath: string): string {
    if (isAbsolute(relPath)) throw new Error('路径越界')
    const rootResolved = resolve(root)
    const target = resolve(rootResolved, relPath)
    if (target !== rootResolved && !target.startsWith(rootResolved + sep)) {
      throw new Error('路径越界')
    }
    return target
  }

  /**
   * 校验并规范化工作空间名
   * @throws 非法名字时抛错
   */
  sanitizeName(input: string): string {
    const name = input.trim()
    if (!name) throw new Error('工作空间名称不能为空')
    if (name.length > NAME_MAX_LEN) throw new Error(`名称长度不能超过 ${NAME_MAX_LEN} 个字符`)
    if (INVALID_CHARS.test(name)) {
      throw new Error('名称不能包含 / \\ : * ? " < > | 字符')
    }
    if (name === '.' || name === '..') throw new Error('名称不能为 . 或 ..')
    if (EDGE_DOTS_SPACES.test(name)) throw new Error('名称不能以 . 或空格开头/结尾')
    if (RESERVED_NAMES.test(name)) throw new Error('名称不能为系统保留名')
    return name
  }

  /** 取路径最后一段作为展示名（外部目录） */
  private basename(dir: string): string {
    const parts = dir.split(/[\\/]/).filter(Boolean)
    return parts[parts.length - 1] ?? dir
  }
}
