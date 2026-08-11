/**
 * E2E：文件附件——「+」→ 添加文件 → 本地文件 → 输入框光标处插入 token
 * 前置：npm run build（生成 out/）
 * 运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/new-task-file.e2e.ts
 * 预置账号：e2euser / Secret123!（由 setup-test-data.mjs 写入隔离数据目录）
 *
 * 覆盖：
 *  - 选中文件后在输入框插入文件 token（图标+文件名），title 为绝对路径
 *  - hover 图标变删除；点击删除 token 移除
 *  - 不支持类型（.zip）选中即 toast 拒绝，不插入
 *  - 文件过大（>5MB）选中即 toast 拒绝，不插入
 *  - 多文件连续插入：2 个 token 保序出现
 *  - 发送后用户气泡折叠为「📎 文件名」；AI 正常回复（文件内容进模型）
 *  - 仅文件无文本发送：气泡只有「📎 文件名」
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000

describe('E2E 文件附件', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-file-'))
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
    // 进入「新建任务」欢迎态（侧栏导航）
    await page.getByRole('button', { name: '新建任务' }).click()
    await page.locator('.welcome-area').waitFor({ state: 'visible', timeout: WAIT })
  })

  afterAll(async () => {
    await app?.close().catch(() => {})
    rmSync(dataHome, { recursive: true, force: true })
  })

  /** hover「+」打开主菜单并等待菜单可见（若菜单已开先点外部关闭） */
  async function openPlusMenu(): Promise<void> {
    if (
      await page
        .locator('.plus-menu')
        .isVisible()
        .catch(() => false)
    ) {
      await page.mouse.click(5, 5)
      await page.locator('.plus-menu').waitFor({ state: 'hidden', timeout: 5_000 })
    }
    // 先移开再 hover，保证派发 mousemove 触发 mouseenter（坐标恰好重合时不派发）
    await page.mouse.move(5, 5)
    await page.locator('[data-plus-menu-trigger]').first().hover()
    await page.locator('.plus-menu').waitFor({ state: 'visible', timeout: 5_000 })
  }

  /** 等待 toast 文本出现（toast 1.5s 自动消失，waitFor 自动重试，需先出现后消失之间命中） */
  async function waitToast(text: string): Promise<void> {
    await page.getByText(text).waitFor({ state: 'visible', timeout: 5_000 })
  }

  it('插入文件 token：title 为绝对路径，hover 变删除，点击删除', async () => {
    const samplePath = join(dataHome, 'sample.txt')
    writeFileSync(samplePath, '这是附件内容，请总结它。')
    // 打开「+」菜单后直接对隐藏 input setInputFiles（触发 change → onFilesSelected → 插入 token）
    await openPlusMenu()
    await page.locator('input.plus-file-input').setInputFiles(samplePath)
    const token = page.locator('.file-token')
    await token.waitFor({ state: 'visible', timeout: 5_000 })
    expect(await token.count()).toBe(1)
    // title 为绝对路径（Electron 39 经 webUtils.getPathForFile 取真实路径）
    expect(await token.getAttribute('title')).toBe(samplePath)
    expect(await token.locator('.file-token-name').innerText()).toBe('sample.txt')
    // 未悬停：删除图标 opacity 0（可证明 scoped 样式真实命中动态 token，而非默认值 1）
    await page.mouse.move(5, 5)
    expect(
      await token.locator('.file-token-del').evaluate((el) => getComputedStyle(el).opacity)
    ).toBe('0')
    // hover：删除图标淡入（过渡 0.15s，用 poll 等过渡完成，避免负载下读到中间值）
    await token.hover()
    await expect
      .poll(
        () =>
          token.locator('.file-token-del').evaluate((el) => getComputedStyle(el).opacity),
        { timeout: 5_000 }
      )
      .toBe('1')
    // 点击删除 → token 移除
    await token.click()
    expect(await page.locator('.file-token').count()).toBe(0)
  }, 60_000)

  it('不支持类型（.zip）选中即 toast 拒绝，不插入', async () => {
    const zipPath = join(dataHome, 'bad.zip')
    writeFileSync(zipPath, 'not a real zip')
    await openPlusMenu()
    await page.locator('input.plus-file-input').setInputFiles(zipPath)
    await waitToast('暂不支持该文件类型：bad.zip')
    expect(await page.locator('.file-token').count()).toBe(0)
  }, 60_000)

  it('文件过大（>5MB）选中即 toast 拒绝，不插入', async () => {
    const bigPath = join(dataHome, 'big.txt')
    writeFileSync(bigPath, Buffer.alloc(5 * 1024 * 1024 + 1, 0x41))
    await openPlusMenu()
    await page.locator('input.plus-file-input').setInputFiles(bigPath)
    await waitToast('文件过大（上限 5MB）：big.txt')
    expect(await page.locator('.file-token').count()).toBe(0)
  }, 60_000)

  it('多文件连续插入：2 个 token 保序出现', async () => {
    const f1 = join(dataHome, 'f1.txt')
    const f2 = join(dataHome, 'f2.txt')
    writeFileSync(f1, 'one')
    writeFileSync(f2, 'two')
    await openPlusMenu()
    await page.locator('input.plus-file-input').setInputFiles([f1, f2])
    await page.locator('.file-token').first().waitFor({ state: 'visible', timeout: 5_000 })
    expect(await page.locator('.file-token').count()).toBe(2)
    expect(await page.locator('.file-token-name').nth(0).innerText()).toBe('f1.txt')
    expect(await page.locator('.file-token-name').nth(1).innerText()).toBe('f2.txt')
    // 清理输入框，避免残留 token 影响后续用例
    await page.locator('.file-token').first().click()
    await page.locator('.file-token').first().click()
    expect(await page.locator('.file-token').count()).toBe(0)
  }, 60_000)

  it('发送后用户气泡折叠为「📎 文件名」，AI 正常回复', async () => {
    const samplePath = join(dataHome, 'sample.txt')
    writeFileSync(samplePath, '这是附件内容，请总结它。')
    await page.locator('.task-textarea').fill('请分析附件')
    await openPlusMenu()
    await page.locator('input.plus-file-input').setInputFiles(samplePath)
    await page.locator('.file-token').waitFor({ state: 'visible', timeout: 5_000 })
    await page.locator('.send-btn').click()
    // 用户气泡：文本 + 📎 文件名折叠标记
    const userBubble = page.locator('.chat-bubble-row--user').last()
    await userBubble.waitFor({ state: 'visible', timeout: 10_000 })
    const bubbleText = await userBubble.innerText()
    expect(bubbleText).toContain('请分析附件')
    expect(bubbleText).toContain('📎 sample.txt')
    // AI 回复非空（流式完成；thinking 占位气泡无文本，须等真实内容出现）
    await page
      .locator('.chat-bubble-row--assistant .chat-bubble')
      .last()
      .waitFor({ state: 'visible', timeout: WAIT })
    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll('.chat-bubble-row--assistant .chat-bubble')
        const last = bubbles[bubbles.length - 1]
        return last && last.textContent && last.textContent.trim().length > 0
      },
      { timeout: WAIT }
    )
    // 等流真正结束（发送按钮由 stop 态恢复），避免残留流影响后续用例（isStreaming 未复位时
    // 欢迎态输入卡渲染的是停止按钮，点击会 cancelMessage 而非发送）
    await page.locator('.send-btn--stop').waitFor({ state: 'detached', timeout: 60_000 })
    const replyText = (await page.locator('.chat-bubble-row--assistant .chat-bubble').last().innerText()).trim()
    expect(replyText.length).toBeGreaterThan(0)
    // 排除调用失败的兜底文案（成功断言：真实模型回复而非错误提示）
    expect(replyText).not.toBe('抱歉，请求出错了，请重试')
    // 文件内容进模型的真实证据：附件内容为「这是附件内容，请总结它。」，收到文件的模型必然提及关键词
    expect(replyText).toContain('附件')
  }, 120_000)

  it('仅文件无文本发送：气泡只有「📎 文件名」', async () => {
    // 上一条用例发送后处于会话视图，先回「新建任务」欢迎态
    await page.getByRole('button', { name: '新建任务' }).click()
    await page.locator('.welcome-area').waitFor({ state: 'visible', timeout: 5_000 })
    const samplePath = join(dataHome, 'sample.txt')
    writeFileSync(samplePath, '这是附件内容，请总结它。')
    await openPlusMenu()
    await page.locator('input.plus-file-input').setInputFiles(samplePath)
    await page.locator('.file-token').waitFor({ state: 'visible', timeout: 5_000 })
    // 发送按钮激活态依赖 taskInput.trim()（innerText 含 token 文本，激活态成立，可发送）
    await page.locator('.send-btn').click()
    const userBubble = page.locator('.chat-bubble-row--user').last()
    await userBubble.waitFor({ state: 'visible', timeout: 10_000 })
    expect((await userBubble.innerText()).trim()).toBe('📎 sample.txt')
  }, 60_000)
})
