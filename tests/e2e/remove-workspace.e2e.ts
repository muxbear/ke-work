/**
 * 移除工作空间 e2e：菜单「从列表中删除」→ 确认框（动态任务数）→ 取消不删 / 确认级联删除
 * 前置：npm run build；运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/remove-workspace.e2e.ts
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000

describe('E2E 移除工作空间确认与级联删除', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never
  let wsName = ''
  let wsDir = ''

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-rmws-'))
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
    await page
      .locator('.login-card, .home-layout')
      .first()
      .waitFor({ state: 'visible', timeout: WAIT })
    // 登录
    await page.getByRole('button', { name: '密码登录' }).click()
    await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
    await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
  })

  afterAll(async () => {
    await app?.close().catch(() => {})
    rmSync(dataHome, { recursive: true, force: true })
    // 删除工作空间仅删记录与会话，磁盘文件夹保留在真实用户目录 ~/KeWork/<wsName>，须一并清理
    if (wsDir) rmSync(wsDir, { recursive: true, force: true })
  })

  /** 新建任务页发送一条消息（创建会话并绑定当前空间） */
  async function sendMessage(text: string): Promise<void> {
    await page.getByText('新建任务').first().click()
    await page.waitForTimeout(800)
    const input = page.locator('.task-textarea').first()
    await input.fill(text)
    await page.locator('.send-btn').first().click()
    await page
      .locator('.send-btn--stop')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => {})
    await page
      .locator('.send-btn--stop')
      .first()
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {})
    await page.waitForTimeout(1_000)
  }

  /** 悬停指定空间组的三点按钮并等待菜单出现 */
  async function openSpaceMenu(group: ReturnType<typeof page.locator>): Promise<void> {
    await page.mouse.move(2, 2)
    const btn = (await group
      .locator('[data-space-menu-trigger]')
      .first()
      .boundingBox())!
    await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2)
    await page.locator('.space-menu').waitFor({ state: 'visible', timeout: 5_000 })
  }

  it('前置: 新建工作空间 → 发送 2 条消息（2 个会话绑定该空间）', async () => {
    // 工作空间名须为 ASCII：Windows 下含非 ASCII 名的目录 rmSync 静默失败
    wsName = `rmws-test-${Date.now().toString(36)}`
    await page.getByText('新建任务').first().click()
    await page.waitForTimeout(800)
    await page.locator('[data-workspace-menu-trigger]').click()
    await page.getByText('新建工作空间').click()
    await page.locator('#ws-create-name').fill(wsName)
    await page.getByRole('button', { name: '创建', exact: true }).click()
    await page
      .locator('[data-workspace-menu-trigger]')
      .filter({ hasText: wsName })
      .waitFor({ state: 'visible', timeout: 10_000 })
    // 工作空间目录落在真实用户目录 ~/KeWork/<wsName>（与 KE_WORK_HOME 无关），afterAll 需一并清理
    wsDir = join(homedir(), 'KeWork', wsName)
    await sendMessage('移除空间测试A')
    await sendMessage('移除空间测试B')
    const group = page.locator('.space-group').filter({ hasText: wsName })
    await group.locator('.space-chat').first().waitFor({ state: 'visible', timeout: WAIT })
    expect(await group.locator('.space-chat').count()).toBe(2)
  }, 240_000)

  it('从列表中删除 → 确认框（含动态任务数）→ 取消不删', async () => {
    const before = await page.locator('.space-chat').count()
    const group = page.locator('.space-group').filter({ hasText: wsName })
    await openSpaceMenu(group)
    await page.getByRole('button', { name: '从列表中删除' }).click()
    // 确认框出现且文案含任务数与「确认移除？」
    await page.locator('.confirm-mask').waitFor({ state: 'visible', timeout: 5_000 })
    const message = (await page.locator('.confirm-message').textContent()) ?? ''
    expect(message).toContain('2 个任务')
    expect(message).toContain('确认移除？')
    // 点取消 → 确认框关闭，空间与会话仍在
    await page.locator('.confirm-btn--cancel').click()
    await page.locator('.confirm-mask').waitFor({ state: 'hidden', timeout: 5_000 })
    expect(await page.locator('.space-group').filter({ hasText: wsName }).count()).toBe(1)
    expect(await page.locator('.space-chat').count()).toBe(before)
  }, 90_000)

  it('再次删除 → 点确认 → 空间消失且会话减少 2', async () => {
    const before = await page.locator('.space-chat').count()
    const group = page.locator('.space-group').filter({ hasText: wsName })
    await openSpaceMenu(group)
    await page.getByRole('button', { name: '从列表中删除' }).click()
    await page.locator('.confirm-mask').waitFor({ state: 'visible', timeout: 5_000 })
    await page.locator('.confirm-btn--danger').click()
    // 轮询等待删除完成：空间组消失 + 会话数减少 2
    await expect
      .poll(() => page.locator('.space-group').filter({ hasText: wsName }).count(), {
        timeout: 5_000
      })
      .toBe(0)
    await expect
      .poll(() => page.locator('.space-chat').count(), { timeout: 5_000 })
      .toBe(before - 2)
  }, 90_000)

  it('默认工作空间无「从列表中删除」菜单项', async () => {
    const defaultGroup = page.locator('.space-group').filter({ hasText: '默认工作空间' })
    await openSpaceMenu(defaultGroup)
    const items = await page.locator('.space-menu-item').allTextContents()
    // 正向兜底：菜单确实弹出且至少含「打开文件夹」，避免菜单未弹出时空数组假通过
    // （allTextContents 不去空白，按钮文本为「 打开文件夹 」，用 join 后 contains 匹配）
    expect(items.join('')).toContain('打开文件夹')
    expect(items.join('')).not.toContain('从列表中删除')
  }, 90_000)
})
