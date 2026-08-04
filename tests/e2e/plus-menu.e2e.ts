/**
 * E2E：「+」弹出菜单（5 个 hover 二级子菜单）
 * 前置：npm run build（生成 out/）
 * 运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/plus-menu.e2e.ts
 * 预置账号：e2euser / Secret123!（由 setup-test-data.mjs 写入隔离数据目录）
 *
 * 覆盖：
 *  - hover 滑出 5 个二级子菜单及其内容
 *  - 模式开关互斥（radio）
 *  - 专家选中：工具栏「+」右侧徽标 + textarea 使用提示词 + 菜单关闭；hover 删除图标；点击移除
 *  - 技能选中：输入卡左上角徽标依次追加 + 菜单关闭；hover 删除图标；点击移除
 *  - 召唤更多专家 → 专家·技能·连接器页「专家」标签页
 *  - 连接器点击 → 「连接器」标签页 + 对应授权连接卡片高亮
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000
const STORAGE_KEY = 'ke-work:task-selection'

describe('E2E 「+」菜单', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-plusmenu-'))
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

  // ── 工具函数 ──

  /** 点击「+」打开主菜单（welcome 态只有一个 + 按钮；若菜单已开先点外部关闭） */
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
    await page.locator('[data-plus-menu-trigger]').first().click()
    await page.locator('.plus-menu').waitFor({ state: 'visible', timeout: 5_000 })
  }

  /** 先把鼠标移到空白处再 hover 目标（避免坐标恰好重合时不派发 mousemove，:hover 不生效） */
  async function hoverAwayThen(target: ReturnType<typeof page.locator>): Promise<void> {
    await page.mouse.move(5, 5)
    await target.hover()
  }

  /** hover 一级菜单项并等待子菜单滑出动画完成 */
  async function hoverTop(name: string): Promise<void> {
    await page.locator('.plus-menu-item', { hasText: name }).hover()
    await page.waitForTimeout(250)
  }

  /** 预置选择状态（localStorage）并整页刷新，使 store 以种子数据初始化 */
  async function seedSelections(data: Record<string, unknown>): Promise<void> {
    await page.evaluate(
      ({ key, d }) => {
        localStorage.setItem(key, JSON.stringify(d))
      },
      { key: STORAGE_KEY, d: data }
    )
    await page.reload()
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
    await page
      .locator('.sidebar-spaces .spaces-toggle')
      .waitFor({ state: 'visible', timeout: WAIT })
  }

  /** 回到「新建任务」欢迎态（侧栏导航） */
  async function gotoNewTask(): Promise<void> {
    await page.getByRole('button', { name: '新建任务' }).click()
    await page.locator('.welcome-area').waitFor({ state: 'visible', timeout: 5_000 })
  }

  it('hover 一级菜单项滑出对应二级子菜单', async () => {
    await openPlusMenu()

    // ① 添加文件
    await hoverTop('添加文件')
    await expectVisible('.plus-submenu-item', '本地文件')
    await expectVisible('.plus-submenu-item', '知识库')

    // ② 模式
    await hoverTop('模式')
    await expectVisible('.plus-submenu-item', '默认')
    await expectVisible('.plus-submenu-item', '本地文件')
    await expectVisible('.plus-submenu-item', '知识库')

    // ③ 专家（搜索框 + 全部专家列表 + 召唤更多专家）
    await hoverTop('专家')
    await page.locator('.plus-submenu-search-input').waitFor({ state: 'visible' })
    expect(await page.locator('.plus-submenu-search-input').getAttribute('placeholder')).toBe(
      '搜索专家'
    )
    await expectVisible('.plus-submenu-item', '林晓雯')
    await expectVisible('.plus-submenu-item', '召唤更多专家')

    // ④ 技能（搜索框 + 列表 + 底部操作项）
    await hoverTop('技能')
    await page.locator('.plus-submenu-search-input').waitFor({ state: 'visible' })
    expect(await page.locator('.plus-submenu-search-input').getAttribute('placeholder')).toBe(
      '搜索技能'
    )
    await expectVisible('.plus-submenu-item', '从本地添加技能')
    await expectVisible('.plus-submenu-item', '管理技能')

    // ⑤ 连接器
    await hoverTop('连接器')
    await page.locator('.plus-submenu-search-input').waitFor({ state: 'visible' })
    expect(await page.locator('.plus-submenu-search-input').getAttribute('placeholder')).toBe(
      '搜索连接器'
    )
    await expectVisible('.plus-submenu-item', '管理连接器')

    // 任一时刻只有一个子菜单展开
    expect(await page.locator('.plus-submenu:visible').count()).toBe(1)
  }, 60_000)

  it('模式开关互斥（默认默认开启，三选一）', async () => {
    // 默认：默认开启
    await openPlusMenu()
    await hoverTop('模式')
    const defaultSwitch = page
      .locator('.plus-submenu-item', { hasText: '默认' })
      .locator('.plus-switch--on')
    await defaultSwitch.waitFor({ state: 'visible', timeout: 5_000 })

    // 点击「本地文件」→ 开启它、关闭默认、菜单关闭
    await page.locator('.plus-submenu-item', { hasText: '本地文件' }).click()
    await page.locator('.plus-menu').waitFor({ state: 'hidden', timeout: 5_000 })

    // 重新打开验证互斥
    await openPlusMenu()
    await hoverTop('模式')
    expect(await page.locator('.plus-switch--on').count()).toBe(1)
    const localSwitch = page
      .locator('.plus-submenu-item', { hasText: '本地文件' })
      .locator('.plus-switch--on')
    await localSwitch.waitFor({ state: 'visible', timeout: 5_000 })
  }, 60_000)

  it('专家选中：工具栏「+」右侧徽标 + textarea 提示词 + hover 删除', async () => {
    await seedSelections({
      mode: 'default',
      selectedExpertId: null,
      selectedExpertPrompt: '',
      selectedSkillIds: [],
      recentExpertIds: [1, 2] // 林晓雯 / 陈法鉴
    })

    await openPlusMenu()
    await hoverTop('专家')
    await page.locator('.plus-submenu-item', { hasText: '林晓雯' }).click()

    // 菜单关闭
    await page.locator('.plus-menu').waitFor({ state: 'hidden', timeout: 5_000 })

    // 徽标出现在 + 号右侧（工具栏内，位于 + 按钮之后）
    const chip = page.locator('.expert-chip')
    await chip.waitFor({ state: 'visible', timeout: 5_000 })
    expect(await chip.textContent()).toContain('林晓雯')
    const plusBox = (await page.locator('[data-plus-menu-trigger]').first().boundingBox())!
    const chipBox = (await chip.boundingBox())!
    expect(chipBox.x).toBeGreaterThan(plusBox.x + plusBox.width)

    // textarea 插入使用提示词
    const val = await page.locator('.task-textarea').inputValue()
    expect(val).toContain('请以【林晓雯·内容创作专家】')

    // hover 徽标 → 删除图标出现；点击 → 徽标与提示词一并移除
    await hoverAwayThen(chip)
    await page.waitForTimeout(200)
    expect(await page.locator('.expert-chip-del').isVisible()).toBe(true)
    await chip.click()
    await page.locator('.expert-chip').waitFor({ state: 'detached', timeout: 5_000 })
    const val2 = await page.locator('.task-textarea').inputValue()
    expect(val2).not.toContain('林晓雯')
  }, 60_000)

  it('技能选中：输入卡左上角徽标依次追加 + hover 删除', async () => {
    // 选中第一个技能 → 菜单关闭、左上角出现徽标
    await openPlusMenu()
    await hoverTop('技能')
    await page.locator('.plus-submenu-item', { hasText: 'PDF 深度解析' }).click()
    await page.locator('.plus-menu').waitFor({ state: 'hidden', timeout: 5_000 })

    const chips = page.locator('.selection-chip')
    await chips.first().waitFor({ state: 'visible', timeout: 5_000 })
    expect(await chips.count()).toBe(1)
    expect(await chips.first().textContent()).toContain('PDF 深度解析')

    // 再选一个 → 依次追加（选中即关闭，可重开继续追加）
    await openPlusMenu()
    await hoverTop('技能')
    await page.locator('.plus-submenu-item', { hasText: '数据图表生成' }).click()
    await page.locator('.plus-menu').waitFor({ state: 'hidden', timeout: 5_000 })
    expect(await chips.count()).toBe(2)
    expect(await chips.nth(0).textContent()).toContain('PDF 深度解析')
    expect(await chips.nth(1).textContent()).toContain('数据图表生成')

    // hover 第一个徽标 → 删除图标（名字左侧）出现；点击移除
    const first = chips.first()
    await hoverAwayThen(first)
    await page.waitForTimeout(200)
    const delOpacity = await first
      .locator('svg')
      .first()
      .evaluate((el) => getComputedStyle(el).opacity)
    expect(delOpacity).toBe('1')
    await first.click()
    expect(await chips.count()).toBe(1)
    expect(await chips.first().textContent()).toContain('数据图表生成')
  }, 60_000)

  it('「召唤更多专家」→ 跳转专家·技能·连接器页「专家」标签页', async () => {
    await gotoNewTask()
    await openPlusMenu()
    await hoverTop('专家')
    await page.locator('.plus-submenu-item', { hasText: '召唤更多专家' }).click()

    await page.locator('.expert-page').waitFor({ state: 'visible', timeout: WAIT })
    const activeTab = await page.locator('.tab-btn--active').textContent()
    expect(activeTab?.trim()).toBe('专家')
    await page.locator('.plus-menu').waitFor({ state: 'hidden', timeout: 5_000 })
  }, 60_000)

  it('连接器点击 → 跳转「连接器」标签页并高亮对应授权连接卡片', async () => {
    await gotoNewTask()
    await openPlusMenu()
    await hoverTop('连接器')
    await page.locator('.plus-submenu-item', { hasText: 'GitHub' }).click()

    await page.locator('.expert-page').waitFor({ state: 'visible', timeout: WAIT })
    const activeTab = await page.locator('.tab-btn--active').textContent()
    expect(activeTab?.trim()).toBe('连接器')

    // 对应授权连接卡片高亮（data-connector-id 定位）
    const focusCard = page.locator('.skill-card--focus')
    await focusCard.waitFor({ state: 'visible', timeout: 5_000 })
    expect(await focusCard.getAttribute('data-connector-id')).toBe('1')
  }, 60_000)

  /** 断言某文本的子菜单项可见 */
  async function expectVisible(selector: string, text: string): Promise<void> {
    const item = page.locator(selector, { hasText: text })
    await item.waitFor({ state: 'visible', timeout: 5_000 })
  }
})
