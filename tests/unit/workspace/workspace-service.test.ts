import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalDataSource } from '../../../src/main/database/local/LocalDataSource'
import { WorkspaceRepository } from '../../../src/main/workspace/WorkspaceRepository'
import { WorkspaceService } from '../../../src/main/workspace/WorkspaceService'

/**
 * 清理测试临时目录树。
 * 注：Node 24 + Windows 的 rimraf 递归删除含非 ASCII（中文）名的目录树会失败/崩溃
 * （vitest fork worker 中表现为静默失败或 Worker exited），先对第一层中文子项
 * 重命名为 ASCII 再删除，绕开该环境问题。
 */
function cleanupTree(dir: string): void {
  if (!existsSync(dir)) return
  for (const child of readdirSync(dir)) {
    const p = join(dir, child)
    try {
      const ascii = join(dir, `tmp-${child.codePointAt(0)}`)
      renameSync(p, ascii)
    } catch {
      // 已是 ASCII 名或删除失败，交给 rmSync 兜底
    }
  }
  rmSync(dir, { recursive: true, force: true })
}

describe('WorkspaceService', () => {
  let ds: LocalDataSource
  let repo: WorkspaceRepository
  let baseDir: string
  let service: WorkspaceService

  beforeEach(() => {
    ds = new LocalDataSource(':memory:')
    repo = new WorkspaceRepository(ds.getDb())
    baseDir = join(tmpdir(), `ke-work-ws-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    mkdirSync(baseDir, { recursive: true })
    service = new WorkspaceService(repo, baseDir)
  })

  afterEach(() => {
    ds.close()
    cleanupTree(baseDir)
  })

  describe('sanitizeName', () => {
    it('合法名 trim 后通过', () => {
      expect(service.sanitizeName('  项目A  ')).toBe('项目A')
    })

    it.each(['', '   '])('空名（"%s"）拒绝', (name) => {
      expect(() => service.sanitizeName(name)).toThrow(/不能为空/)
    })

    it('超长名（51 字符）拒绝', () => {
      expect(() => service.sanitizeName('a'.repeat(51))).toThrow(/长度/)
    })

    it.each(['../x', 'a/b', 'a\\b', 'a:b', 'a<b'])('路径字符（"%s"）拒绝', (name) => {
      expect(() => service.sanitizeName(name)).toThrow(/不能包含/)
    })

    it('点/点点 拒绝', () => {
      expect(() => service.sanitizeName('.')).toThrow()
      expect(() => service.sanitizeName('..')).toThrow()
    })

    it('首尾点/空格拒绝（首尾空格经 trim 处理为合法）', () => {
      expect(() => service.sanitizeName('.hidden')).toThrow(/开头\/结尾/)
      expect(() => service.sanitizeName('a.')).toThrow(/开头\/结尾/)
      expect(service.sanitizeName(' a ')).toBe('a')
    })

    it.each(['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'lpt9'])(
      '保留名（"%s"）拒绝',
      (name) => {
        expect(() => service.sanitizeName(name)).toThrow(/保留名/)
      }
    )
  })

  describe('createWorkspace', () => {
    it('创建目录并入库（目录落在基目录下）', () => {
      const ws = service.createWorkspace('测试项目')
      expect(ws.source).toBe('created')
      expect(ws.path).toBe(join(baseDir, '测试项目'))
      expect(existsSync(ws.path)).toBe(true)
      expect(service.list()).toHaveLength(1)
    })

    it('同名已存在拒绝', () => {
      service.createWorkspace('重复')
      expect(() => service.createWorkspace('重复')).toThrow(/已存在/)
    })

    it('非法名透传 sanitize 错误', () => {
      expect(() => service.createWorkspace('a/b')).toThrow()
      expect(service.list()).toHaveLength(0)
    })
  })

  describe('ensureTimestampWorkspace', () => {
    it('命名 YYYYMMDD-HHmmss 且创建目录', () => {
      const ws = service.ensureTimestampWorkspace()
      expect(ws.source).toBe('timestamp')
      expect(ws.name).toMatch(/^\d{8}-\d{6}$/)
      expect(existsSync(ws.path)).toBe(true)
    })

    it('重复调用幂等（返回同一条记录，不重复建目录）', () => {
      const a = service.ensureTimestampWorkspace()
      const b = service.ensureTimestampWorkspace()
      expect(a.id).toBe(b.id)
      expect(service.list()).toHaveLength(1)
    })
  })

  describe('selectExternalDir', () => {
    it('用户取消返回 null', async () => {
      const svc = new WorkspaceService(repo, baseDir, {
        selectDir: vi.fn().mockResolvedValue(null)
      })
      expect(await svc.selectExternalDir()).toBeNull()
      expect(service.list()).toHaveLength(0)
    })

    it('选中目录入库（source: external）且不重复', async () => {
      const external = join(baseDir, '外部目录')
      mkdirSync(external, { recursive: true })
      const svc = new WorkspaceService(repo, baseDir, {
        selectDir: vi.fn().mockResolvedValue(external)
      })
      const a = await svc.selectExternalDir()
      const b = await svc.selectExternalDir()
      expect(a!.source).toBe('external')
      expect(a!.path).toBe(external)
      expect(b!.id).toBe(a!.id)
      expect(service.list()).toHaveLength(1)
    })
  })

  describe('resolveWorkspace', () => {
    it('目录存在返回运行参数', () => {
      const ws = service.createWorkspace('解析')
      const resolved = service.resolveWorkspace(ws.id)
      expect(resolved).toEqual({ id: ws.id, name: '解析', dir: ws.path })
    })

    it('id 不存在返回 null', () => {
      expect(service.resolveWorkspace('nope')).toBeNull()
    })

    it('目录被删除返回 null', () => {
      const ws = service.createWorkspace('将被删')
      // 模拟目录从原位置消失（rename 而非 rm，绕开中文路径删除的环境问题）
      renameSync(ws.path, join(baseDir, 'moved-away'))
      expect(service.resolveWorkspace(ws.id)).toBeNull()
    })
  })

  describe('listFiles', () => {
    it('空目录返回空数组', () => {
      const ws = service.createWorkspace('empty-dir')
      expect(service.listFiles(ws.id)).toEqual([])
    })

    it('目录优先 + 字母序排序', () => {
      const ws = service.createWorkspace('sorted')
      writeFileSync(join(ws.path, 'b.txt'), 'b')
      writeFileSync(join(ws.path, 'a.txt'), 'a')
      mkdirSync(join(ws.path, 'z-dir'))
      mkdirSync(join(ws.path, 'a-dir'))
      const entries = service.listFiles(ws.id)
      expect(entries.map((e) => e.name)).toEqual(['a-dir', 'z-dir', 'a.txt', 'b.txt'])
      expect(entries.map((e) => e.type)).toEqual(['dir', 'dir', 'file', 'file'])
      expect(entries[0].relPath).toBe('a-dir')
    })

    it('隐藏名过滤（.git/node_modules/.DS_Store）', () => {
      const ws = service.createWorkspace('hidden')
      mkdirSync(join(ws.path, '.git'))
      mkdirSync(join(ws.path, 'node_modules'))
      writeFileSync(join(ws.path, '.DS_Store'), 'x')
      writeFileSync(join(ws.path, 'visible.txt'), 'x')
      const entries = service.listFiles(ws.id)
      expect(entries.map((e) => e.name)).toEqual(['visible.txt'])
    })

    it('relPath 子目录遍历（返回嵌套相对路径）', () => {
      const ws = service.createWorkspace('nested')
      mkdirSync(join(ws.path, 'src', 'lib'), { recursive: true })
      writeFileSync(join(ws.path, 'src', 'main.ts'), 'x')
      const entries = service.listFiles(ws.id, 'src')
      expect(entries.map((e) => e.relPath)).toEqual(['src/lib', 'src/main.ts'])
    })

    it('工作空间 id 不存在抛错', () => {
      expect(() => service.listFiles('nope')).toThrow(/不存在/)
    })

    it('越界路径（../）与绝对路径拒绝', () => {
      const ws = service.createWorkspace('secure')
      expect(() => service.listFiles(ws.id, '../')).toThrow(/越界/)
      expect(() => service.listFiles(ws.id, '../../etc')).toThrow(/越界/)
      expect(() => service.listFiles(ws.id, join(tmpdir(), 'x'))).toThrow(/越界/)
    })

    it('relPath 指向文件抛错', () => {
      const ws = service.createWorkspace('file-target')
      writeFileSync(join(ws.path, 'a.txt'), 'x')
      expect(() => service.listFiles(ws.id, 'a.txt')).toThrow(/不是目录/)
    })

    it('超过 200 条截断', () => {
      const ws = service.createWorkspace('many')
      for (let i = 0; i < 250; i++) {
        writeFileSync(join(ws.path, `f${String(i).padStart(3, '0')}.txt`), 'x')
      }
      const entries = service.listFiles(ws.id)
      expect(entries.length).toBe(200)
    })
  })

  describe('readFile', () => {
    it('读取文本内容', () => {
      const ws = service.createWorkspace('read-ok')
      writeFileSync(join(ws.path, 'hello.txt'), '你好，ke-work', 'utf-8')
      const result = service.readFile(ws.id, 'hello.txt')
      expect(result.content).toBe('你好，ke-work')
      expect(result.truncated).toBe(false)
    })

    it('含 NUL 的二进制文件拒绝', () => {
      const ws = service.createWorkspace('binary')
      writeFileSync(join(ws.path, 'img.bin'), Buffer.from([0x89, 0x50, 0x00, 0x0a, 0x01]))
      expect(() => service.readFile(ws.id, 'img.bin')).toThrow(/二进制/)
    })

    it('超过 200KB 截断并置 truncated', () => {
      const ws = service.createWorkspace('large')
      writeFileSync(join(ws.path, 'big.log'), 'a'.repeat(250 * 1024))
      const result = service.readFile(ws.id, 'big.log')
      expect(result.truncated).toBe(true)
      expect(result.content.length).toBeLessThanOrEqual(200 * 1024)
    })

    it('越界路径拒绝', () => {
      const ws = service.createWorkspace('read-secure')
      expect(() => service.readFile(ws.id, '../secret.txt')).toThrow(/越界/)
      expect(() => service.readFile(ws.id, join(tmpdir(), 'secret.txt'))).toThrow(/越界/)
    })

    it('文件不存在 / 指向目录抛错', () => {
      const ws = service.createWorkspace('read-missing')
      expect(() => service.readFile(ws.id, 'nope.txt')).toThrow(/ENOENT|不存在/)
      mkdirSync(join(ws.path, 'dir'))
      expect(() => service.readFile(ws.id, 'dir')).toThrow(/不是文件/)
    })
  })

  describe('openWorkspace', () => {
    it('打开目录调用 openPath', async () => {
      const openPath = vi.fn().mockResolvedValue(undefined)
      const svc = new WorkspaceService(repo, baseDir, { openPath })
      const ws = svc.createWorkspace('打开')
      await svc.openWorkspace(ws.id)
      expect(openPath).toHaveBeenCalledWith(ws.path)
    })

    it('id 不存在抛错', async () => {
      await expect(service.openWorkspace('nope')).rejects.toThrow(/不存在/)
    })
  })
})
