/**
 * 诊断：侧栏任务项（chat）三点按钮 hover 菜单"一层一层叠在一起"问题
 * 前置：npm run build；运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/chat-menu-layers.e2e.ts
 */
import { _electron as electron } from 'playwright'
import { appendFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000
/** 诊断日志（vitest 抑制 stdout，写文件读取） */
const DIAG_LOG = join(tmpdir(), 'kw-chatmenu-diag.log')

describe('E2E chat 菜单多层诊断', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-chatmenu-'))
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
    // 等待发送结束（停止按钮消失），最多 15s
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

  /** 输出当前 .chat-menu 实例列表（数量 + 位置 + 定位方式） */
  async function dumpChatMenus(label: string): Promise<void> {
    const info = await page.evaluate(() => {
      const menus = Array.from(document.querySelectorAll('.chat-menu'))
      return menus.map((m) => {
        const r = m.getBoundingClientRect()
        const parent = m.parentElement
        return {
          text: (m.textContent ?? '').trim().slice(0, 20),
          y: Math.round(r.y),
          h: Math.round(r.height),
          x: Math.round(r.x),
          pos: getComputedStyle(m).position,
          inDom: document.contains(m),
          parentCls: parent?.className ?? ''
        }
      })
    })
    appendFileSync(DIAG_LOG, `[${label}] ${info.length} ${JSON.stringify(info)}\n`, 'utf-8')
  }

  it('前置: 创建 3 个会话（侧栏出现多个任务项）', async () => {
    for (const text of ['菜单诊断消息A', '菜单诊断消息B', '菜单诊断消息C']) {
      await sendMessage(text)
    }
    // 回侧栏（空间区域出现会话任务项）
    const chats = page.locator('.space-chat')
    await chats.first().waitFor({ state: 'visible', timeout: WAIT })
    await page.waitForTimeout(1_000)
    console.log('[前置] 侧栏任务项数量:', await chats.count())
  }, 240_000)

  it('诊断-1: hover 任务项三点按钮 → 菜单稳定后的实例数与布局', async () => {
    await page.mouse.move(2, 2)
    const btn = (await page.locator('[data-chat-menu-trigger]').first().boundingBox())!
    await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2)
    await page.locator('.chat-menu').first().waitFor({ state: 'visible', timeout: 5_000 })
    await page.waitForTimeout(400) // 等待动画完成、菜单稳定
    await dumpChatMenus('诊断-1 稳定后')
    const count = await page.locator('.chat-menu').count()
    console.log('[诊断-1] 期望实例数为 1, 实际:', count)
    expect(count).toBe(1)
  }, 60_000)

  it('诊断-2: hover 打开 → 快速移出再重新 hover（leave 动画窗口内重开）→ 是否叠加', async () => {
    const btn = (await page.locator('[data-chat-menu-trigger]').first().boundingBox())!
    // 打开
    await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2)
    await page.locator('.chat-menu').first().waitFor({ state: 'visible', timeout: 5_000 })
    // 快速移出（触发延迟关闭）再立即重新悬停（不等待菜单关闭）
    await page.mouse.move(2, 2)
    await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2)
    await page.waitForTimeout(400)
    await dumpChatMenus('诊断-2 快速重开后')
    const count = await page.locator('.chat-menu').count()
    console.log('[诊断-2] 期望实例数为 1, 实际:', count)
    expect(count).toBe(1)
  }, 60_000)

  it('诊断-3: 快速掠过多个任务项按钮（A→B→C 不停留）→ 是否叠加/累积', async () => {
    const triggers = page.locator('[data-chat-menu-trigger]')
    const n = await triggers.count()
    console.log('[诊断-3] 任务项按钮数量:', n)
    const boxes: Array<{ x: number; y: number }> = []
    for (let i = 0; i < Math.min(n, 4); i++) {
      const b = (await triggers.nth(i).boundingBox())!
      boxes.push({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
    }
    // 先悬停在第一个按钮打开菜单
    await page.mouse.move(2, 2)
    await page.mouse.move(boxes[0].x, boxes[0].y)
    await page.locator('.chat-menu').first().waitFor({ state: 'visible', timeout: 5_000 })
    // 快速掠过其余按钮（steps 分步插值 = CDP 内部连续派发，模拟真实鼠标快速扫过）
    for (const p of boxes.slice(1)) {
      await page.mouse.move(p.x, p.y, { steps: 6 })
    }
    // 立即统计（捕捉 leave/enter 并存窗口）
    await dumpChatMenus('诊断-3 快速掠过瞬间')
    // 等待动画完成后再统计（验证是否收敛）
    await page.waitForTimeout(500)
    await dumpChatMenus('诊断-3 稳定后')
  }, 60_000)

  it('诊断-4: hover A 按钮 → 移入 A 菜单 → 快速移出并掠过 B → 菜单切换叠加', async () => {
    const triggers = page.locator('[data-chat-menu-trigger]')
    const boxA = (await triggers.nth(0).boundingBox())!
    await page.mouse.move(2, 2)
    await page.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 2)
    await page.locator('.chat-menu').first().waitFor({ state: 'visible', timeout: 5_000 })
    const menuA = (await page.locator('.chat-menu').first().boundingBox())!
    // 移入菜单 → 移出菜单（触发 close → leave 动画）→ steps 快速掠过 B 按钮（模拟真实速度）
    await page.mouse.move(menuA.x + menuA.width / 2, menuA.y + menuA.height / 2, { steps: 5 })
    await page.mouse.move(2, 2)
    if ((await triggers.count()) > 1) {
      const boxB = (await triggers.nth(1).boundingBox())!
      await page.mouse.move(boxB.x + boxB.width / 2, boxB.y + boxB.height / 2, { steps: 8 })
    }
    await dumpChatMenus('诊断-4 切换后瞬间')
    await page.waitForTimeout(500)
    await dumpChatMenus('诊断-4 稳定后')
  }, 60_000)

  it('诊断-5: 在 A/B 两个按钮间快速来回移动（真实鼠标抖动）→ 是否累积多层', async () => {
    const triggers = page.locator('[data-chat-menu-trigger]')
    if ((await triggers.count()) < 2) return
    const boxA = (await triggers.nth(0).boundingBox())!
    const boxB = (await triggers.nth(1).boundingBox())!
    // 打开 A 菜单
    await page.mouse.move(2, 2)
    await page.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 2)
    await page.locator('.chat-menu').first().waitFor({ state: 'visible', timeout: 5_000 })
    // 快速来回 A→B→A→B（steps 插值模拟连续移动）
    for (let i = 0; i < 2; i++) {
      await page.mouse.move(boxB.x + boxB.width / 2, boxB.y + boxB.height / 2, { steps: 5 })
      await page.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 2, { steps: 5 })
    }
    await dumpChatMenus('诊断-5 来回抖动后瞬间')
    await page.waitForTimeout(500)
    await dumpChatMenus('诊断-5 稳定后')
  }, 60_000)

  it('诊断-6: 逐项扫描所有任务项按钮（每个 hover 后立即检查）→ 全程单实例', async () => {
    const triggers = page.locator('[data-chat-menu-trigger]')
    const n = await triggers.count()
    console.error('[诊断-6] 任务项按钮总数:', n)
    const seen: number[] = []
    await page.mouse.move(2, 2)
    for (let i = 0; i < n; i++) {
      const b = (await triggers.nth(i).boundingBox())!
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 })
      // 立即统计（不等动画），记录每个 hover 后的菜单实例数
      const c = await page.locator('.chat-menu').count()
      seen.push(c)
      // 每项停留 120ms（模拟用户逐项查看，接近 leave/enter 窗口时长）
      await page.waitForTimeout(120)
      const c2 = await page.locator('.chat-menu').count()
      seen.push(c2)
    }
    appendFileSync(DIAG_LOG, `[诊断-6] 每步菜单实例数序列: ${JSON.stringify(seen)}\n`, 'utf-8')
    // 任意时刻不应超过 1 个实例
    expect(Math.max(...seen)).toBeLessThanOrEqual(1)
  }, 90_000)
})
