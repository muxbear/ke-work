/**
 * E2E：输入框左下「默认权限」菜单 + 允许完全访问风险确认
 * 前置：npm run build（生成 out/）
 * 运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/permission-menu.e2e.ts
 * 预置账号：e2euser / Secret123!（由 setup-test-data.mjs 写入隔离数据目录）
 *
 * 覆盖：
 *  - 点击「默认权限」滑出菜单：说明文案 + 「允许完全访问」开关默认关闭
 *  - 开关悬浮 title 提示文案
 *  - 点击开关弹出风险确认：未勾选时「允许完全访问」按钮不可点
 *  - 取消：弹窗关闭、开关保持关闭
 *  - 勾选后确认开启：开关打开、localStorage 持久化
 *  - 已开启时点击开关直接关闭（无需确认）
 *
 * 注：弹窗内交互（勾选/按钮）会经 document mousedown 关闭背后的权限菜单，
 *     验证开关状态前需重开菜单。
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000
const FULL_ACCESS_KEY = 'ke-work.full-access'

describe('E2E 「默认权限」菜单', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-permmenu-'))
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

  /** 打开「默认权限」菜单并等待可见（若已开先点外部关闭） */
  async function openPermMenu(): Promise<void> {
    if (
      await page
        .locator('.perm-menu')
        .isVisible()
        .catch(() => false)
    ) {
      await page.mouse.click(5, 5)
      await page.locator('.perm-menu').waitFor({ state: 'hidden', timeout: 5_000 })
    }
    await page.getByRole('button', { name: '默认权限' }).click()
    await page.locator('.perm-menu').waitFor({ state: 'visible', timeout: 5_000 })
  }

  it('点击「默认权限」滑出菜单：沙箱说明文案 + 开关默认关闭 + 悬浮提示', async () => {
    await openPermMenu()
    // 说明文案（沙箱约束）
    const desc = await page.locator('.perm-desc').innerText()
    expect(desc).toContain('当前为默认权限')
    expect(desc).toContain('安全沙箱')
    // 开关默认关闭
    const sw = page.locator('.perm-switch')
    expect(await sw.getAttribute('aria-checked')).toBe('false')
    expect(await sw.evaluate((el) => el.classList.contains('perm-switch--on'))).toBe(false)
    // 悬浮 title 提示（风险说明）
    const title = await sw.getAttribute('title')
    expect(title).toContain('开启后将减少确认步骤')
    expect(title).toContain('敏感操作')
  }, 60_000)

  it('点击开关弹出风险确认：未勾选时不可确认；取消后开关保持关闭', async () => {
    await openPermMenu()
    await page.locator('.perm-switch').click()
    await page.locator('.perm-confirm-card').waitFor({ state: 'visible', timeout: 5_000 })
    expect(await page.locator('.perm-confirm-message').innerText()).toContain(
      '仅建议在您信任当前任务时使用'
    )
    // 未勾选「我已了解风险」：确认按钮禁用
    const confirmBtn = page.getByRole('button', { name: '允许完全访问' })
    expect(await confirmBtn.isDisabled()).toBe(true)
    await page.locator('.perm-risk-checkbox').check()
    expect(await confirmBtn.isDisabled()).toBe(false)
    // 取消：弹窗关闭；重开菜单验证开关保持关闭
    await page.getByRole('button', { name: '取消' }).click()
    await page.locator('.perm-confirm-card').waitFor({ state: 'hidden', timeout: 5_000 })
    await openPermMenu()
    expect(await page.locator('.perm-switch').getAttribute('aria-checked')).toBe('false')
  }, 60_000)

  it('勾选风险须知后确认开启：开关打开并持久化到 localStorage', async () => {
    await openPermMenu()
    await page.locator('.perm-switch').click()
    await page.locator('.perm-confirm-card').waitFor({ state: 'visible', timeout: 5_000 })
    await page.locator('.perm-risk-checkbox').check()
    await page.getByRole('button', { name: '允许完全访问' }).click()
    await page.locator('.perm-confirm-card').waitFor({ state: 'hidden', timeout: 5_000 })
    // 重开菜单验证开关已打开
    await openPermMenu()
    expect(await page.locator('.perm-switch').getAttribute('aria-checked')).toBe('true')
    expect(
      await page.locator('.perm-switch').evaluate((el) => el.classList.contains('perm-switch--on'))
    ).toBe(true)
    // localStorage 持久化
    expect(await page.evaluate((k) => localStorage.getItem(k), FULL_ACCESS_KEY)).toBe('1')
  }, 60_000)

  it('已开启时点击开关直接关闭（不再弹确认）', async () => {
    await openPermMenu()
    await page.locator('.perm-switch').click()
    // 无确认弹窗出现（detached：DOM 中不存在即通过）
    await page.locator('.perm-confirm-card').waitFor({ state: 'detached', timeout: 5_000 })
    expect(await page.locator('.perm-switch').getAttribute('aria-checked')).toBe('false')
    expect(await page.evaluate((k) => localStorage.getItem(k), FULL_ACCESS_KEY)).toBe('0')
  }, 60_000)
})
