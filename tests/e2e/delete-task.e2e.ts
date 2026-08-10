/**
 * 删除任务确认对话框 e2e：菜单「删除任务」→ 确认框 → 取消不删 / 确认删库
 * 前置：npm run build；运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/delete-task.e2e.ts
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000
const CONFIRM_MESSAGE = '确认从列表中删除任务吗？删除后对话记录无法恢复，请确认是否删除？'

describe('E2E 删除任务确认对话框', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-deletetask-'))
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
  })

  /** 新建任务页发送一条消息（创建会话） */
  async function sendMessage(text: string): Promise<void> {
    await page.getByText('新建任务').first().click()
    await page.waitForTimeout(800)
    const input = page.locator('.task-textarea').first()
    await input.fill(text)
    await page.locator('.send-btn').first().click()
    // 等待发送结束（停止按钮出现再消失），最多 15s
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

  /** 悬停第一个任务项的三点按钮并等待菜单出现 */
  async function openChatMenu(): Promise<void> {
    await page.mouse.move(2, 2)
    const btn = (await page.locator('[data-chat-menu-trigger]').first().boundingBox())!
    await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2)
    await page.locator('.chat-menu').first().waitFor({ state: 'visible', timeout: 5_000 })
  }

  it('前置: 创建 2 个会话', async () => {
    await sendMessage('删除任务测试A')
    await sendMessage('删除任务测试B')
    const chats = page.locator('.space-chat')
    await chats.first().waitFor({ state: 'visible', timeout: WAIT })
    expect(await chats.count()).toBeGreaterThanOrEqual(2)
  }, 240_000)

  it('删除任务 → 确认框出现 → 点取消不删除', async () => {
    const before = await page.locator('.space-chat').count()
    await openChatMenu()
    await page.getByRole('button', { name: '删除任务' }).click()
    // 确认框出现且文案正确
    await page.locator('.confirm-mask').waitFor({ state: 'visible', timeout: 5_000 })
    expect((await page.locator('.confirm-message').textContent())?.trim()).toBe(CONFIRM_MESSAGE)
    // 点取消 → 确认框关闭，会话仍在
    await page.locator('.confirm-btn--cancel').click()
    await page.locator('.confirm-mask').waitFor({ state: 'hidden', timeout: 5_000 })
    expect(await page.locator('.space-chat').count()).toBe(before)
  }, 90_000)

  it('删除任务 → 确认框 → 点确认删除（会话从列表消失）', async () => {
    const before = await page.locator('.space-chat').count()
    await openChatMenu()
    await page.getByRole('button', { name: '删除任务' }).click()
    await page.locator('.confirm-mask').waitFor({ state: 'visible', timeout: 5_000 })
    await page.locator('.confirm-btn--danger').click()
    // 确认框关闭，会话减少一个（轮询等待删除完成，避免固定延时 flake）
    await page.locator('.confirm-mask').waitFor({ state: 'hidden', timeout: 5_000 })
    await expect
      .poll(() => page.locator('.space-chat').count(), { timeout: 5_000 })
      .toBe(before - 1)
  }, 90_000)
})
