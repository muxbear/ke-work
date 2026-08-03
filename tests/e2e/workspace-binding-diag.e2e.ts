/**
 * 诊断：非默认工作空间下会话绑定失效
 * 流程：登录 → 新建工作空间"诊断空间"（自动选中）→ 发送消息 → 查 checkpoints 表 metadata 分布 → 侧栏断言
 * 验证 H1：最新 checkpoint（子图 ns 非空）是否无 workspace 字段
 * 前置：npm run build；运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/workspace-binding-diag.e2e.ts
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
const LOG = join(tmpdir(), 'kw-binding-diag.log')

describe('诊断: 非默认工作空间绑定', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never

  beforeAll(async () => {
    appendFileSync(LOG, '=== 新一轮 ===\n', 'utf-8')
    dataHome = mkdtempSync(join(tmpdir(), 'kw-binding-'))
    execFileSync(process.execPath, [
      join(process.cwd(), 'tests', 'e2e', 'setup-test-data.mjs'),
      dataHome
    ])
    app = await electron.launch({
      args: [APP_ENTRY],
      env: {
        ...process.env,
        KE_WORK_HOME: dataHome,
        KE_WORK_USER_DATA: join(dataHome, 'user-data')
      }
    })
    page = await app.firstWindow()
    await page.locator('.login-card, .home-layout').first().waitFor({ state: 'visible', timeout: WAIT })
    await page.getByRole('button', { name: '密码登录' }).click()
    await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
    await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
  })

  afterAll(async () => {
    await app?.close().catch(() => {})
    rmSync(dataHome, { recursive: true, force: true })
  })

  it('创建唯一名称工作空间 → 选中 → 发送消息', async () => {
    const wsName = `诊断空间${Date.now().toString(36)}`
    // 进入新建任务页
    await page.getByText('新建任务').first().click()
    await page.waitForTimeout(800)
    // 打开工作空间选择器 → 新建工作空间
    await page.locator('[data-workspace-menu-trigger]').click()
    await page.getByText('新建工作空间').click()
    await page.locator('#ws-create-name').fill(wsName)
    await page.getByRole('button', { name: '创建', exact: true }).click()
    // 等待创建完成并自动选中（触发按钮应显示空间名）
    await page
      .locator('[data-workspace-menu-trigger]')
      .filter({ hasText: wsName })
      .waitFor({ state: 'visible', timeout: 10_000 })
    appendFileSync(LOG, `[创建] 已选中 ${wsName}\n`, 'utf-8')
    // 发送消息
    const input = page.locator('.task-textarea').first()
    await input.fill('绑定诊断：这条消息应归属诊断空间')
    await page.locator('.send-btn').first().click()
    // 等待图执行完成
    await page
      .locator('.send-btn--stop')
      .first()
      .waitFor({ state: 'hidden', timeout: 60_000 })
      .catch(() => {})
    await page.waitForTimeout(3_000)
  }, 120_000)

  it('查 checkpoints 表 metadata 分布 + 侧栏断言', async () => {
    await app.close()
    const db = new Database(join(dataHome, 'ke-work.db'))
    const rows = db
      .prepare('SELECT thread_id, checkpoint_ns, checkpoint_id, metadata FROM checkpoints')
      .all() as Array<{
      thread_id: string
      checkpoint_ns: string
      checkpoint_id: string
      metadata: Buffer | string
    }>
    db.close()
    appendFileSync(LOG, `[查库] checkpoints 总行数=${rows.length}\n`, 'utf-8')
    for (const r of rows) {
      let meta: Record<string, unknown> = {}
      try {
        meta = JSON.parse(r.metadata.toString('utf-8'))
      } catch {
        try {
          meta = JSON.parse(r.metadata as unknown as string)
        } catch {
          meta = {}
        }
      }
      const ws = meta.workspace as { id?: string; name?: string } | undefined
      appendFileSync(
        LOG,
        `  行: ns=${r.checkpoint_ns || '(主图)'} id=${r.checkpoint_id.slice(0, 8)} workspace=${ws ? JSON.stringify(ws) : '无'}\n`,
        'utf-8'
      )
    }
  }, 30_000)

  it('侧栏断言：诊断空间组下应有会话', async () => {
    // 重启应用（checkpoint 已持久化），验证侧栏归属
    await app?.close().catch(() => {})
    app = await electron.launch({
      args: [APP_ENTRY],
      env: {
        ...process.env,
        KE_WORK_HOME: dataHome,
        KE_WORK_USER_DATA: join(dataHome, 'user-data')
      }
    })
    page = await app.firstWindow()
    await page.locator('.login-card, .home-layout').first().waitFor({ state: 'visible', timeout: WAIT })
    // token 保留时直接进 /home，否则重新登录
    if (await page.locator('.login-card').count()) {
      await page.getByRole('button', { name: '密码登录' }).click()
      await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
      await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
    }
    await page.locator('.sidebar-spaces .spaces-toggle').waitFor({ state: 'visible', timeout: WAIT })
    await page.waitForTimeout(2_000)
    // 诊断空间组下的会话数（修复前应为 0）
    const diagGroup = page.locator('.space-group').filter({ hasText: '诊断空间' })
    const diagChats = await diagGroup.locator('.space-chat').count()
    // 默认空间组下的会话数
    const defGroup = page.locator('.space-group').filter({ hasText: '默认工作空间' })
    const defChats = await defGroup.locator('.space-chat').count()
    appendFileSync(LOG, `[侧栏] 诊断空间组会话=${diagChats}, 默认空间组会话=${defChats}\n`, 'utf-8')
    console.error(`[侧栏] 诊断空间组会话=${diagChats}, 默认空间组会话=${defChats}`)
    expect(diagChats).toBeGreaterThanOrEqual(1)
  }, 90_000)
})
