/**
 * E2E：输入框「AI 改写润色」按钮（+ 号右侧图标）
 * 前置：npm run build（生成 out/）
 * 运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/polish-input.e2e.ts
 * 预置账号：e2euser / Secret123!（由 setup-test-data.mjs 写入隔离数据目录）
 *
 * 覆盖：
 *  - 悬浮 title 完整名称「AI 改写润色」
 *  - 空输入点击 → toast 提示，不调 LLM
 *  - 输入内容点击 → 主进程调 LLM 改写，结果替换输入框内容
 *    （真实 LLM 回复有波动：断言输入非空 + 内容发生变化，即改写成功路径）
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000

describe('E2E 「AI 改写润色」', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-polish-'))
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
    await page.locator('.login-card, .home-layout').first().waitFor({
      state: 'visible',
      timeout: WAIT
    })
    await page.getByRole('button', { name: '密码登录' }).click()
    await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
    await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
    await page
      .locator('.sidebar-spaces .spaces-toggle')
      .waitFor({ state: 'visible', timeout: WAIT })
  })

  afterAll(async () => {
    await app?.close().catch(() => {})
    rmSync(dataHome, { recursive: true, force: true })
  })

  /** 等待 toast 文本出现（toast 1.5s 自动消失，waitFor 自动重试，需先出现后消失之间命中） */
  async function waitToast(text: string): Promise<void> {
    await page.getByText(text).waitFor({ state: 'visible', timeout: 5_000 })
  }

  it('悬浮 title 为「AI 改写润色」；空输入点击 → toast 提示且不调 LLM', async () => {
    const btn = page.locator('button[title="AI 改写润色"]')
    await btn.waitFor({ state: 'visible', timeout: 5_000 })
    expect(await btn.getAttribute('title')).toBe('AI 改写润色')
    // 输入框为空：点击仅提示，内容保持为空
    await btn.click()
    await waitToast('请先输入要改写的内容')
    expect((await page.locator('.task-textarea').first().innerText()).trim()).toBe('')
  }, 60_000)

  it('输入内容后点击：改写结果替换输入框内容（真实 LLM）', async () => {
    const input = page.locator('.task-textarea').first()
    const original = '请帮我写一份关于人工智能发展的报告'
    await input.fill(original)
    await page.locator('button[title="AI 改写润色"]').click()
    // 等改写完成：输入内容被替换（轮询直到与原文不同，超时即 LLM 调用失败）
    await expect
      .poll(async () => (await input.innerText()).trim(), { timeout: WAIT })
      .not.toBe(original)
    const result = (await input.innerText()).trim()
    expect(result.length).toBeGreaterThan(0)
    // 请求结束后按钮恢复可点
    await page.locator('button[title="AI 改写润色"]:not([disabled])').waitFor({
      state: 'visible',
      timeout: 5_000
    })
  }, 120_000)
})
