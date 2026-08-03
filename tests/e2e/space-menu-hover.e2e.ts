/**
 * E2E：空间菜单 hover 行为复现/回归测试（Playwright 驱动 Electron）
 * 前置：npm run build（生成 out/）
 * 运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/space-menu-hover.e2e.ts
 * 预置账号：e2euser / Secret123!（由 setup-test-data.mjs 写入隔离数据目录）
 *
 * 覆盖两个用户报告的 bug：
 *  - 症状 1：悬停三个点按钮弹出菜单后，鼠标向左/右移出按钮，菜单不消失
 *  - 症状 2：悬停弹出菜单后，鼠标移向菜单项的过程中菜单提前消失
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000

describe('E2E 空间菜单 hover 行为', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-menu-'))
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
    // 本地密码登录进入 /home
    await page.getByRole('button', { name: '密码登录' }).click()
    await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
    await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
    // 等待侧栏"空间"区域出现（默认工作空间记录由主进程 workspace:list 保证）
    await page.locator('.sidebar-spaces .spaces-toggle').waitFor({ state: 'visible', timeout: WAIT })
  })

  afterAll(async () => {
    await app?.close().catch(() => {})
    rmSync(dataHome, { recursive: true, force: true })
  })

  /** 第一个（默认工作空间）组头的三个点按钮 */
  function menuTrigger(): ReturnType<typeof page.locator> {
    return page.locator('[data-space-menu-trigger]').first()
  }

  /** 悬停到元素中心并等待菜单出现且动画完成（boundingBox 取最终位置） */
  async function hoverOpenMenu(): Promise<void> {
    // 先移到页面左上角（离开任何元素），保证后续 mouseenter 可靠触发
    await page.mouse.move(2, 2)
    const box = (await menuTrigger().boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.locator('.space-menu').waitFor({ state: 'visible', timeout: 5_000 })
    // 等待 dropdown enter 动画（opacity/transform/visibility 0.15s）完成，避免取到动画中间位置
    await page.waitForTimeout(250)
  }

  it('症状1: 悬停按钮弹出菜单 → 鼠标左移出按钮 → 菜单应关闭', async () => {
    await hoverOpenMenu()
    // 鼠标左移到组头名称区域（仍在组头内，但已移出按钮）
    const hdr = (await page.locator('.space-header').first().boundingBox())!
    await page.mouse.move(hdr.x + 20, hdr.y + hdr.height / 2)
    await page.waitForTimeout(600) // 远大于 120ms 宽限
    const menuCount = await page.locator('.space-menu').count()
    console.log('[症状1] 移出按钮 600ms 后菜单实例数（期望 0）:', menuCount)
    expect(menuCount).toBe(0)
  }, 60_000)

  it('症状2: 悬停弹出菜单 → 鼠标连续移向菜单项（不停顿）→ 菜单应保持且菜单项可 hover', async () => {
    await hoverOpenMenu()
    const btn = (await menuTrigger().boundingBox())!
    const menu = (await page.locator('.space-menu').boundingBox())!
    const item = (await page.locator('.space-menu-item').first().boundingBox())!
    // 连续移动（模拟用户"想移到菜单项"的自然操作）：
    // 先到按钮与菜单之间的间隙（触发按钮 mouseleave），分步继续移入菜单第一项
    await page.mouse.move(btn.x + btn.width / 2, menu.y - 3, { steps: 2 })
    const gapCount = await page.locator('.space-menu').count()
    console.log('[症状2] 间隙点后菜单数（期望 1）:', gapCount)
    expect(gapCount).toBe(1)
    await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2, { steps: 8 })
    const afterMove = await page.locator('.space-menu').count()
    console.log('[症状2] 连续移入菜单项后菜单数（期望 1）:', afterMove)
    expect(afterMove).toBe(1)
    // 等待 hover 背景过渡（.space-menu-item 的 background-color transition 0.15s）完成后断言
    await page.waitForTimeout(250)
    const bg = await page
      .locator('.space-menu-item')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    console.log('[症状2] 菜单项 hover 背景:', bg)
    // 菜单项应处于 hover 态（修复前：visibility 冲突导致不可交互、无 hover 背景）
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  }, 60_000)

  it('间隙停留: 鼠标停在按钮与菜单之间（不进菜单）→ 菜单应在宽限后自动关闭', async () => {
    await hoverOpenMenu()
    const btn = (await menuTrigger().boundingBox())!
    const menu = (await page.locator('.space-menu').boundingBox())!
    // 移到按钮与菜单之间的间隙并停留（鼠标不在按钮上、不在菜单上）
    await page.mouse.move(btn.x + btn.width / 2, menu.y - 3)
    await page.waitForTimeout(400) // 大于 200ms 关闭宽限
    const menuCount = await page.locator('.space-menu').count()
    console.log('[间隙停留] 停留 400ms 后菜单数（期望 0）:', menuCount)
    expect(menuCount).toBe(0)
  }, 60_000)
})
