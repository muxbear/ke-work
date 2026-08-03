/**
 * 验证：AI 总结标题（发送消息后异步生成，标题非"新对话"且 ≤20 字符，重启后持久化）
 * 前置：npm run build；运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/title-summary.e2e.ts
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync, readFileSync, appendFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000
const MAIN_LOG = join(tmpdir(), 'kw-title-main.log')

/** 加载项目 .env（e2e 直接 launch out/ 产物绕过 electron-vite 启动器，需手动注入 LLM key） */
function loadDotEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].trim()
    }
  } catch {
    // 无 .env 时跳过（标题生成会失败兜底）
  }
  return env
}

describe('E2E AI 总结标题', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never

  async function launchAndLogin(): Promise<void> {
    await app?.close().catch(() => {})
    app = await electron.launch({
      args: [APP_ENTRY],
      env: {
        ...process.env,
        ...loadDotEnv(),
        KE_WORK_HOME: dataHome,
        KE_WORK_USER_DATA: join(dataHome, 'user-data')
      }
    })
    page = await app.firstWindow()
    app.process().stdout?.on('data', (d: Buffer) => appendFileSync(MAIN_LOG, '[main] ' + d.toString()))
    app.process().stderr?.on('data', (d: Buffer) => appendFileSync(MAIN_LOG, '[main-err] ' + d.toString()))
    await page.locator('.login-card, .home-layout').first().waitFor({ state: 'visible', timeout: WAIT })
    if (await page.locator('.login-card').count()) {
      await page.getByRole('button', { name: '密码登录' }).click()
      await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
      await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
    }
  }

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-title-'))
    execFileSync(process.execPath, [
      join(process.cwd(), 'tests', 'e2e', 'setup-test-data.mjs'),
      dataHome
    ])
  })

  afterAll(async () => {
    await app?.close().catch(() => {})
    rmSync(dataHome, { recursive: true, force: true })
  })

  it('发送消息 → 侧栏标题变为 AI 总结（非"新对话"，≤20 字符）', async () => {
    await launchAndLogin()
    await page.getByText('新建任务').first().click()
    await page.waitForTimeout(800)
    const input = page.locator('.task-textarea').first()
    await input.fill('请用三句话介绍电子邮件的收发原理，以及 SMTP 和 POP3 协议的区别')
    await page.locator('.send-btn').first().click()
    // 等待发送完成
    await page
      .locator('.send-btn--stop')
      .first()
      .waitFor({ state: 'hidden', timeout: 60_000 })
      .catch(() => {})
    // 等待 AI 总结标题生成（异步，最多 60s）
    await page
      .locator('.space-chat-title')
      .filter({ hasText: /^新对话$/ })
      .first()
      .waitFor({ state: 'attached', timeout: 10_000 })
      .catch(() => {})
    let title = ''
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(2_000)
      const titles = await page.locator('.space-chat-title').allTextContents()
      title = titles[0] ?? ''
      if (title && title !== '新对话') break
    }
    console.error(`[标题] 生成结果: "${title}"`)
    expect(title).toBeTruthy()
    expect(title).not.toBe('新对话')
    expect(title.length).toBeLessThanOrEqual(20)
  }, 180_000)

  it('重启后标题持久化（conversation_titles 表）', async () => {
    await launchAndLogin()
    await page.locator('.sidebar-spaces .spaces-toggle').waitFor({ state: 'visible', timeout: WAIT })
    await page.waitForTimeout(2_000)
    const titles = await page.locator('.space-chat-title').allTextContents()
    const title = titles[0] ?? ''
    console.error(`[重启] 会话标题: "${title}"`)
    expect(title).toBeTruthy()
    expect(title).not.toBe('新对话')
    expect(title.length).toBeLessThanOrEqual(20)
  }, 90_000)
})
