/**
 * E2E：本地密码登录全流程（Playwright 驱动 Electron）
 * 前置：npm run build（生成 out/）
 * 运行：npx vitest run --config vitest.e2e.config.ts
 * 预置账号：e2euser / Secret123!（由 setup-test-data.mjs 写入隔离数据目录）
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import Database from 'better-sqlite3'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000

describe('E2E 登录全流程', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-e2e-'))
    execFileSync(process.execPath, [
      join(process.cwd(), 'tests', 'e2e', 'setup-test-data.mjs'),
      dataHome
    ])
  })

  afterAll(async () => {
    await app?.close()
    rmSync(dataHome, { recursive: true, force: true })
  })

  /** 启动应用并等待登录页/主界面就绪 */
  async function launchApp(): Promise<void> {
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
    // 等待 Vue 应用挂载（登录卡片或侧栏任一出现）
    await page.locator('.login-card, .home-layout').first().waitFor({
      state: 'visible',
      timeout: WAIT
    })
  }

  it('E2E-01: 本地密码登录成功进入 /home', async () => {
    await launchApp()
    await page.getByRole('button', { name: '密码登录' }).click()
    await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
    await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
  }, 90_000)

  it('E2E-01b: 重启后保持登录（token 持久化）', async () => {
    await launchApp()
    // 直接进入 /home（路由守卫基于 localStorage token 放行）
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
  }, 90_000)

  it('E2E-05: 创建会话并发送消息，重启后数据持久化', async () => {
    // 从 Home 新建任务进入会话页
    await page.getByText('新建任务').first().click()
    await page.waitForTimeout(1_000)
    // 发送一条消息（聊天输入框）
    const input = page.locator('.chat-input, textarea, input[type="text"]').last()
    await input.fill('E2E 持久化测试消息')
    await page.keyboard.press('Enter')
    // 用户消息出现在对话区
    await page.getByText('E2E 持久化测试消息').first().waitFor({
      state: 'visible',
      timeout: 15_000
    })

    // 重启后校验持久化：消息存于 LangGraph checkpoints.sqlite（checkpoints 表 checkpoint 列，JsonPlusSerializer 明文 JSON）
    await app.close()
    const db = new Database(join(dataHome, 'checkpoints.sqlite'))
    const rows = db.prepare('SELECT checkpoint FROM checkpoints').all() as Array<{ checkpoint: Buffer }>
    const allText = rows.map((r) => r.checkpoint.toString('utf-8')).join('')
    db.close()
    expect(allText).toContain('E2E 持久化测试消息')
  }, 90_000)

  it('E2E-02b: 残留 token 但主进程会话为空 → 路由守卫拦截回登录页', async () => {
    // 前置：E2E-01 已登录（localStorage 有 token、session.json 有用户）
    await launchApp()
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
    await app.close()
    // 模拟主进程会话丢失（删除 session.json），localStorage token 残留
    const { rmSync } = await import('fs')
    rmSync(join(dataHome, 'config', 'session.json'), { force: true })
    // 重启：路由守卫校验主进程会话失败 → 清除本地登录态 → 回登录页
    await launchApp()
    await page.locator('.login-card').waitFor({ state: 'visible', timeout: WAIT })
    const homeVisible = await page.locator('.home-layout').count()
    expect(homeVisible).toBe(0)
  }, 90_000)

  it('E2E-03: 无云端后端时切换云端模式回滚（模式保持本地 + 错误提示）', async () => {
    await launchApp()
    // 前序用例的登录态仍在 localStorage → 清除后回到登录页
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.locator('.login-card').waitFor({ state: 'visible', timeout: 15_000 })
    // 登录页点击云端工作 → mode:set 经主进程尝试重建云端 Agent（无 Postgres 连接串）应失败
    await page.getByText('云端工作').click()
    // 失败后模式回滚：本地工作按钮仍为选中态
    await page
      .locator('.mode-btn--active')
      .filter({ hasText: '本地工作' })
      .waitFor({ state: 'visible', timeout: 15_000 })
  }, 90_000)

  it('E2E-04: 退出登录——确认弹窗后回登录页，token 与主进程会话清除', async () => {
    // 自包含登录（前序用例已清 localStorage）
    await launchApp()
    await page.getByRole('button', { name: '密码登录' }).click()
    await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
    await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })

    // 打开用户菜单 → 点击"退出登录" → 弹出确认窗口
    await page.locator('[data-usermenu-trigger]').click()
    await page.locator('.user-menu').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByRole('button', { name: '退出登录' }).click()
    await page.locator('.confirm-card').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText('登出后会停止所有正在执行中的任务（包括后台会话），确认要登出吗？').waitFor({
      state: 'visible',
      timeout: 15_000
    })

    // 点确认 → 回到登录页
    await page.getByRole('button', { name: '确认登出' }).click()
    await page.locator('.login-card').waitFor({ state: 'visible', timeout: WAIT })

    // 本地 token 清除
    const token = await page.evaluate(() => localStorage.getItem('user_token'))
    expect(token).toBeNull()

    // 主进程会话已清（session.json 持久化 userId=null）
    const { readFileSync } = await import('fs')
    const raw = JSON.parse(readFileSync(join(dataHome, 'config', 'session.json'), 'utf-8'))
    expect(raw.userId).toBeNull()

    // 手动导航 /home 被守卫拦截（主进程 session 为权威）
    await page.evaluate(() => {
      location.hash = '#/home'
    })
    await page.locator('.login-card').waitFor({ state: 'visible', timeout: 15_000 })
    const homeVisible = await page.locator('.home-layout').count()
    expect(homeVisible).toBe(0)
  }, 90_000)

  it('E2E-06: 登录页键盘交互——默认焦点与回车触发登录', async () => {
    await launchApp()

    // 默认（验证码模式）：手机号输入框获取焦点
    await page.waitForFunction(() => {
      const el = document.activeElement as HTMLInputElement | null
      return el?.placeholder === '请输入手机号'
    })

    // 验证码模式：手机号与验证码未填全时按回车不触发登录
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    expect(await page.locator('.login-card').count()).toBe(1)

    // 切到密码登录：账号输入框自动获取焦点
    await page.getByRole('button', { name: '密码登录' }).click()
    await page.waitForFunction(() => {
      const el = document.activeElement as HTMLInputElement | null
      return el?.placeholder === '手机号 / 用户名'
    })

    // 密码模式：输入账号与密码后按回车触发登录进入 /home
    await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
    await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
    await page.keyboard.press('Enter')
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
  }, 90_000)
})
