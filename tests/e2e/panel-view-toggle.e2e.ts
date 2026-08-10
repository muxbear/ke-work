/**
 * 右栏视图切换回归：文件标签页打开后点击「工作空间文件」网格图标应回到文件树（而非跳概览），
 * 文件树展示中再点才切回进入前的视图（概览）；再次进入文件视图不应残留上一个标签页内容。
 *
 * 流程：登录 → 新建工作空间（自动选中）→ 主进程侧写入测试文件 → 发消息（会话绑定该空间）
 *       → 空间区点击会话进入对话态 → 展开右栏（概览）→ 网格图标（文件树）→ 打开文件（标签页内容）
 *       → 网格图标（回到文件树）→ 网格图标（回到概览）→ 网格图标（再进文件树，不应残留标签页内容）
 * 前置：npm run build；运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/panel-view-toggle.e2e.ts
 */
import { _electron as electron } from 'playwright'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000

describe('右栏视图切换回归（标签页 → 文件树 → 概览）', () => {
  let dataHome: string
  let wsDir: string | undefined
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never
  let wsName = ''

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-panel-'))
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
    if (wsDir && existsSync(wsDir)) rmSync(wsDir, { recursive: true, force: true })
  })

  it('新建工作空间 → 写入测试文件 → 发消息（会话绑定该空间）', async () => {
    await page.getByText('新建任务').first().click()
    await page.waitForTimeout(800)
    // 工作空间名须为 ASCII：Node/Windows 对含非 ASCII 名的目录 rmSync 静默失败（测试清理不掉）
    wsName = `panel-test-${Date.now().toString(36)}`
    // 打开工作空间选择器 → 新建工作空间（自动选中）
    await page.locator('[data-workspace-menu-trigger]').click()
    await page.getByText('新建工作空间').click()
    await page.locator('#ws-create-name').fill(wsName)
    await page.getByRole('button', { name: '创建', exact: true }).click()
    await page
      .locator('[data-workspace-menu-trigger]')
      .filter({ hasText: wsName })
      .waitFor({ state: 'visible', timeout: 10_000 })
    // 目录已由主进程创建，直接写入测试文件（与主进程同机文件系统）
    wsDir = join(homedir(), 'KeWork', wsName)
    if (!existsSync(wsDir)) throw new Error(`工作空间目录未创建: ${wsDir}`)
    writeFileSync(join(wsDir, 'demo.txt'), 'hello from e2e panel test\n')
    // 发消息：会话在发送时本地登记并绑定当前工作空间（无需等 agent 跑完）
    const input = page.locator('.task-textarea').first()
    await input.fill('测试：验证右栏视图切换')
    await page.locator('.send-btn').first().click()
    await page
      .locator('.send-btn--stop')
      .first()
      .waitFor({ state: 'hidden', timeout: 60_000 })
      .catch(() => {})
    await page.waitForTimeout(2_000)
  }, 120_000)

  it('空间区点击会话进入对话态 → 右栏：概览 → 文件树 → 标签页 → 文件树 → 概览', async () => {
    // 侧栏出现绑定到该工作空间分组下的会话
    const group = page.locator('.space-group').filter({ hasText: wsName })
    await group.locator('.space-chat').first().waitFor({ state: 'visible', timeout: WAIT })
    // 进入对话态页面
    await group.locator('.space-chat').first().click()
    // 展开右栏（收起态顶部展开按钮）
    await page.locator('.csp-expand-btn').waitFor({ state: 'visible', timeout: WAIT })
    await page.locator('.csp-expand-btn').click()
    // 默认概览视图（工作空间卡片 + 会话卡片）
    await page.locator('.csp-card').first().waitFor({ state: 'visible', timeout: WAIT })
    expect(await page.locator('.csp-card').count()).toBe(2)
    // ① 网格图标 → 工作空间文件视图：文件树显示 demo.txt（.first() 排除产物区隐藏的同名列表）
    const gridIcon = page.locator('.csp-view-trigger[title="工作空间文件"]')
    await gridIcon.click()
    await page.locator('.fl-file-name', { hasText: 'demo.txt' }).first().waitFor({ state: 'visible', timeout: WAIT })
    expect(await page.locator('.csp-card').count()).toBe(0)
    // ② 点击文件 → 标签页打开，展示文件内容（.fp-code 限定右栏预览；聊天区引用的同名文本不干扰）
    await page.locator('.fl-file-name', { hasText: 'demo.txt' }).first().click()
    await page.locator('.csp-tab', { hasText: 'demo.txt' }).waitFor({ state: 'visible', timeout: WAIT })
    await page.locator('.fp-code', { hasText: 'hello from e2e panel test' }).waitFor({ state: 'visible', timeout: WAIT })
    // ③ 再点网格图标 → 回到文件树（标签页保留在顶栏，内容预览收起）
    await gridIcon.click()
    await page.locator('.fl-file-name', { hasText: 'demo.txt' }).first().waitFor({ state: 'visible', timeout: WAIT })
    expect(await page.locator('.fp-code', { hasText: 'hello from e2e panel test' }).count()).toBe(0)
    expect(await page.locator('.csp-card').count()).toBe(0)
    expect(await page.locator('.csp-tab', { hasText: 'demo.txt' }).count()).toBe(1)
    // ④ 再点网格图标 → 回到概览（进入文件视图前的视图）
    await gridIcon.click()
    await page.locator('.csp-card').first().waitFor({ state: 'visible', timeout: WAIT })
    // ⑤ 再次进入文件视图 → 应显示文件树，不残留上一个标签页内容
    await gridIcon.click()
    await page.locator('.fl-file-name', { hasText: 'demo.txt' }).first().waitFor({ state: 'visible', timeout: WAIT })
    expect(await page.locator('.fp-code', { hasText: 'hello from e2e panel test' }).count()).toBe(0)
    console.error('[panel-toggle] 全流程断言通过：文件树 → 标签页 → 文件树 → 概览 → 文件树')
  }, 90_000)
})
