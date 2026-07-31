/**
 * Bug 复现：登录后新建任务发送消息，观察页面状态与主进程日志
 */
import { afterAll, beforeAll, describe, it } from 'vitest'
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000

describe('复现：发送消息异常', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never
  const mainLogs: string[] = []

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-repro-'))
    execFileSync(process.execPath, [
      join(process.cwd(), 'tests', 'e2e', 'setup-test-data.mjs'),
      dataHome
    ])
  })

  afterAll(async () => {
    await app?.close()
    rmSync(dataHome, { recursive: true, force: true })
  })

  it('登录 → 新建任务 → 发送消息（观察行为）', async () => {
    app = await electron.launch({
      args: [APP_ENTRY],
      env: { ...process.env, KE_WORK_HOME: dataHome, KE_WORK_USER_DATA: join(dataHome, 'user-data') }
    })
    app.process().stdout?.on('data', (d: Buffer) => mainLogs.push(d.toString()))
    app.process().stderr?.on('data', (d: Buffer) => mainLogs.push('[ERR] ' + d.toString()))
    page = await app.firstWindow()

    // 登录
    await page.locator('.login-card').waitFor({ state: 'visible', timeout: WAIT })
    await page.getByRole('button', { name: '密码登录' }).click()
    await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
    await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })

    // 新建任务
    await page.getByText('新建任务').first().click()
    await page.waitForTimeout(1_000)

    // 捕获页面 console（渲染层错误）
    const rendererErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        rendererErrors.push(`[${msg.type()}] ${msg.text()}`)
      }
    })

    // 输入并点击发送
    const input = page.locator('.task-textarea').first()
    await input.fill('请做一个详细的自我介绍')
    await page.locator('.send-btn').first().click()

    // 观察 8 秒
    await page.waitForTimeout(8_000)

    // 页面当前状态
    const buttonState = await page.locator('.send-btn').first().isVisible().catch(() => false)
    const stopVisible = await page.locator('.send-btn--stop').count()
    const bodyText = await page.locator('body').innerText()
    console.log('=== 页面按钮: 发送可见=', buttonState, ', 停止可见=', stopVisible)
    console.log('=== 页面文本尾部:', bodyText.slice(-600).replace(/\n+/g, ' | '))
    console.log('=== 渲染层 console 错误:', rendererErrors.length ? rendererErrors.join('\n') : '(无)')
    console.log('=== 主进程日志尾部:', mainLogs.slice(-30).join('\n'))
  }, 120_000)
})
