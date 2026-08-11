/**
 * E2E：设置 → 模型页 → 添加自定义模型 → 聊天页下拉出现「自定义模型」分组（闭环）
 * 前置：npm run build（生成 out/）
 * 运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/add-model.e2e.ts
 * 预置账号：e2euser / Secret123!（由 setup-test-data.mjs 写入隔离数据目录）
 * 模型名用 ASCII（gpt-4o），规避 Windows rmSync 中文目录名静默失败
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000

describe('E2E 添加自定义模型全流程', () => {
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

  /** 启动应用并等待主界面就绪 */
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
    await page.locator('.login-card, .home-layout').first().waitFor({
      state: 'visible',
      timeout: WAIT
    })
  }

  /** 本地密码登录进入 /home */
  async function login(): Promise<void> {
    await page.getByRole('button', { name: '密码登录' }).click()
    await page.getByPlaceholder('手机号 / 用户名').fill('e2euser')
    await page.getByPlaceholder('请输入密码（至少6位）').fill('Secret123!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('.home-layout').waitFor({ state: 'visible', timeout: WAIT })
  }

  it('E2E-MOD-01: 登录 → 设置 → 模型页添加模型 → 落盘 → 聊天页下拉出现', async () => {
    await launchApp()
    await login()

    // 打开设置：左侧栏底部用户名 → 用户菜单 → 「设置」
    await page.locator('.user-avatar-btn').click()
    await page.locator('.user-menu .menu-item', { hasText: '设置' }).click()
    await page.locator('.settings-card').waitFor({ state: 'visible', timeout: WAIT })

    // 左侧导航 → 「模型」页
    await page.locator('.settings-aside button', { hasText: '模型' }).click()
    await page.locator('.m-add-btn').waitFor({ state: 'visible', timeout: 15_000 })
    // 初始空态
    await page.locator('.m-empty').waitFor({ state: 'visible', timeout: 15_000 })

    // 打开「＋ 添加模型」弹窗
    await page.locator('.m-add-btn').click()
    await page.locator('.am-card').waitFor({ state: 'visible', timeout: 15_000 })
    // 默认提供商 DeepSeek + 提供方式 Token Plan（无需填 API 地址）

    // 模型名称：选择器输入 gpt-4o（DeepSeek 预设模型列表无此项 → 走「使用输入值」）
    await page.locator('.am-picker-btn').click()
    await page.locator('.am-picker-input').fill('gpt-4o')
    await page.locator('.am-picker-option', { hasText: '使用输入值' }).click()

    // API Key
    await page.locator('.am-input').fill('sk-e2e-test')

    // 保存
    await page.locator('.am-btn-save').click()

    // 弹窗关闭 + 列表出现新模型
    await page.locator('.am-card').waitFor({ state: 'hidden', timeout: 15_000 })
    await page.locator('.m-model-list', { hasText: 'gpt-4o' }).waitFor({
      state: 'visible',
      timeout: 15_000
    })

    // 落盘断言：models.json 合并结构（providers + models）+ apiKey 明文 + 字段完整
    const modelsPath = join(dataHome, 'models.json')
    expect(existsSync(modelsPath)).toBe(true)
    const raw = JSON.parse(readFileSync(modelsPath, 'utf-8')) as {
      version: number
      providers: Array<{ id: string; name: string; nameEn?: string; logo: string; models?: string[] }>
      models: Array<Record<string, unknown>>
    }
    expect(raw.version).toBe(1)
    expect(raw.models).toHaveLength(1)
    expect(raw.models[0].id).toBe('gpt-4o')
    expect(raw.models[0].vendor).toBe('深度求索')
    expect(raw.models[0].apiKey).toBe('sk-e2e-test')
    expect(raw.models[0].supportsToolCall).toBe(true)
    // providers 与 models 合并于同一文件（含中国提供商种子：中文名/英文名/LOGO/模型列表）
    const deepseek = raw.providers.find((p) => p.id === 'deepseek')!
    expect(deepseek.name).toBe('深度求索')
    expect(deepseek.nameEn).toBe('DeepSeek')
    expect(deepseek.logo).toBe('deepseek')
    expect(deepseek.models).toContain('deepseek-chat')
    expect(raw.providers.map((p) => p.name)).toContain('智谱')
    expect(existsSync(join(dataHome, 'providers.json'))).toBe(false)

    // 关闭设置窗口
    await page.locator('button[aria-label="关闭设置"]').click()
    await page.locator('.settings-card').waitFor({ state: 'hidden', timeout: 15_000 })

    // 进入新建任务页，模型下拉出现「自定义模型」分组 + gpt-4o
    await page.getByText('新建任务').first().click()
    await page.locator('.model-btn').waitFor({ state: 'visible', timeout: 15_000 })
    // 模型下拉已改为 hover 打开：先移开再 hover，保证派发 mousemove 触发 mouseenter
    await page.mouse.move(5, 5)
    await page.locator('.model-btn').hover()
    await page.locator('.model-group-label', { hasText: '自定义模型' }).waitFor({
      state: 'visible',
      timeout: 15_000
    })
    const customOption = page.locator('.model-option', { hasText: 'gpt-4o' })
    await customOption.waitFor({ state: 'visible', timeout: 15_000 })
    expect(await customOption.textContent()).toContain('gpt-4o')
  }, 90_000)

  it('E2E-MOD-02: 编辑已保存模型 → 模型名称（即 id）可修改 → 列表与落盘更新', async () => {
    // 复用 E2E-MOD-01 的登录态与已添加的 gpt-4o；重新打开设置
    await page.locator('.user-avatar-btn').click()
    await page.locator('.user-menu .menu-item', { hasText: '设置' }).click()
    await page.locator('.settings-card').waitFor({ state: 'visible', timeout: WAIT })
    await page.locator('.settings-aside button', { hasText: '模型' }).click()
    await page.locator('.m-model-list', { hasText: 'gpt-4o' }).waitFor({
      state: 'visible',
      timeout: 15_000
    })

    // 点击列表项的「编辑」图标按钮
    await page.locator('button[aria-label="编辑模型"]').click()
    await page.locator('.am-card').waitFor({ state: 'visible', timeout: 15_000 })
    // 编辑弹窗标题 + 模型名称预填
    expect(await page.locator('.am-title').textContent()).toBe('编辑模型')
    expect(await page.locator('.am-picker-btn span').textContent()).toBe('gpt-4o')

    // 修改模型名称（原为锁定，现可编辑）：输入 gpt-4o-mini → 走「使用输入值」
    await page.locator('.am-picker-btn').click()
    await page.locator('.am-picker-input').fill('gpt-4o-mini')
    await page.locator('.am-picker-option', { hasText: '使用输入值' }).click()
    await page.locator('.am-btn-save').click()

    // 弹窗关闭 + 列表显示新名称、旧名称消失
    await page.locator('.am-card').waitFor({ state: 'hidden', timeout: 15_000 })
    await page.locator('.m-model-list', { hasText: 'gpt-4o-mini' }).waitFor({
      state: 'visible',
      timeout: 15_000
    })
    // 精确匹配旧名称（hasText 为子串匹配，gpt-4o-mini 会命中 gpt-4o）
    expect(await page.locator('.m-card-title', { hasText: /^gpt-4o$/ }).count()).toBe(0)

    // 落盘断言：id 已更新（改名即改 id）
    const raw = JSON.parse(readFileSync(join(dataHome, 'models.json'), 'utf-8')) as {
      models: Array<Record<string, unknown>>
    }
    expect(raw.models).toHaveLength(1)
    expect(raw.models[0].id).toBe('gpt-4o-mini')
    expect(raw.models[0].name).toBe('gpt-4o-mini')
  }, 90_000)
})
