/**
 * 修复验证：发送一条消息（产生多个 checkpoint）→ 侧栏任务项应只有 1 个
 * 前置：npm run build；运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/dedup-verify.e2e.ts
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync, appendFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000
const LOG = join(tmpdir(), 'kw-dedup-verify.log')

describe('修复验证: checkpoint 去重', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends { firstWindow(): Promise<infer T> } ? T : never

  beforeAll(async () => {
    appendFileSync(LOG, '=== 新一轮 ===\n', 'utf-8')
    dataHome = mkdtempSync(join(tmpdir(), 'kw-dedup-'))
    execFileSync(process.execPath, [join(process.cwd(), 'tests', 'e2e', 'setup-test-data.mjs'), dataHome])
  })

  afterAll(async () => {
    await app?.close().catch(() => {})
    rmSync(dataHome, { recursive: true, force: true })
  })

  it('发送一条消息 → checkpoints 多行但侧栏任务项只有 1 个', async () => {
    app = await electron.launch({
      args: [APP_ENTRY],
      env: { ...process.env, KE_WORK_HOME: dataHome, KE_WORK_USER_DATA: join(dataHome, 'user-data') }
    })
    page = await app.firstWindow()
    await page.locator('.login-card, .home-layout').first().waitFor({ state: 'visible', timeout: WAIT })
    await page.getByRole('button', { name: '密码登录' }).click()
    await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
    await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
    // 发送消息并等待图执行完成
    await page.getByText('新建任务').first().click()
    await page.waitForTimeout(800)
    const input = page.locator('.task-textarea').first()
    await input.fill('验证消息：介绍一下你的能力')
    await page.locator('.send-btn').first().click()
    await page.waitForTimeout(15_000)
    // 回侧栏统计任务项数量
    await page.locator('.sidebar-spaces').first().waitFor({ state: 'visible', timeout: WAIT })
    const chatCount = await page.locator('.space-chat').count()
    const triggerCount = await page.locator('[data-chat-menu-trigger]').count()
    await app.close()
    // 查库确认 checkpoint 分布
    const db = new Database(join(dataHome, 'ke-work.db'))
    const rows = db.prepare('SELECT thread_id FROM checkpoints').all() as Array<{ thread_id: string }>
    db.close()
    const byThread = new Map<string, number>()
    for (const r of rows) byThread.set(r.thread_id, (byThread.get(r.thread_id) ?? 0) + 1)
    const maxPerThread = Math.max(0, ...byThread.values())
    appendFileSync(LOG, `checkpoints 总行数=${rows.length}, 最多同 thread 行数=${maxPerThread}, 侧栏任务项=${chatCount}, 按钮=${triggerCount}\n`, 'utf-8')
    // 修复后：即使同 thread 有多行 checkpoint，侧栏也只显示 1 个任务项
    expect(chatCount).toBe(1)
    expect(triggerCount).toBe(1)
    expect(maxPerThread).toBeGreaterThan(1) // 确认环境确实产生了多个 checkpoint（否则用例无意义）
  }, 120_000)
})
