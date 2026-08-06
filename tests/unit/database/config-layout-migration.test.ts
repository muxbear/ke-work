import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { migrateLegacyConfigFiles } from '../../../src/main/data-dir'

let baseDir: string

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'ke-layout-'))
})

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true })
})

describe('migrateLegacyConfigFiles（config/ → 顶层平铺，对齐 WorkBuddy）', () => {
  it('旧布局三文件迁移到顶层，config/ 空目录删除', () => {
    const legacy = join(baseDir, 'config')
    mkdirSync(legacy)
    writeFileSync(join(legacy, 'work-mode.json'), '{"mode":"local"}', 'utf-8')
    writeFileSync(join(legacy, 'session.json'), '{}', 'utf-8')
    writeFileSync(join(legacy, 'secrets.bin'), 'encrypted', 'utf-8')

    migrateLegacyConfigFiles(baseDir)

    expect(existsSync(join(baseDir, 'work-mode.json'))).toBe(true)
    expect(existsSync(join(baseDir, 'session.json'))).toBe(true)
    expect(existsSync(join(baseDir, 'secrets.bin'))).toBe(true)
    expect(readFileSync(join(baseDir, 'work-mode.json'), 'utf-8')).toBe('{"mode":"local"}')
    expect(existsSync(legacy)).toBe(false) // 空目录已删除
  })

  it('顶层目标已存在时不覆盖（以顶层为准）', () => {
    const legacy = join(baseDir, 'config')
    mkdirSync(legacy)
    writeFileSync(join(legacy, 'work-mode.json'), '{"mode":"cloud"}', 'utf-8')
    writeFileSync(join(baseDir, 'work-mode.json'), '{"mode":"local"}', 'utf-8')

    migrateLegacyConfigFiles(baseDir)

    expect(readFileSync(join(baseDir, 'work-mode.json'), 'utf-8')).toBe('{"mode":"local"}')
  })

  it('无 config/ 目录时 no-op', () => {
    expect(() => migrateLegacyConfigFiles(baseDir)).not.toThrow()
    expect(existsSync(join(baseDir, 'work-mode.json'))).toBe(false)
  })

  it('config/ 残留未迁移文件时不删除目录', () => {
    const legacy = join(baseDir, 'config')
    mkdirSync(legacy)
    writeFileSync(join(legacy, 'work-mode.json'), '{"mode":"local"}', 'utf-8')
    writeFileSync(join(legacy, 'other.json'), '{}', 'utf-8') // 非迁移名单文件

    migrateLegacyConfigFiles(baseDir)

    expect(existsSync(join(baseDir, 'work-mode.json'))).toBe(true)
    expect(existsSync(legacy)).toBe(true) // 仍有其他文件，目录保留
    expect(existsSync(join(legacy, 'other.json'))).toBe(true)
  })
})
