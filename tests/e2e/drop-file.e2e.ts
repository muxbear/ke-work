/**
 * E2E：文件拖入消息输入框（效果与「+ → 添加文件 → 本地文件」一致）
 * 前置：npm run build（生成 out/）
 * 运行：npx vitest run --config vitest.e2e.config.ts tests/e2e/drop-file.e2e.ts
 * 预置账号：e2euser / Secret123!（由 setup-test-data.mjs 写入隔离数据目录）
 *
 * 覆盖：
 *  - 真实文件拖入（CDP Input.dispatchDragEvent，带磁盘路径）：拖拽高亮出现 → 光标处插入文件 token
 *    （title 为绝对路径，与「+ → 本地文件」插入效果一致）
 *  - 已有文本时拖入：token 插入到拖放点（光标位置）之后
 *  - 无法解析路径的文件（合成 File）拖入：toast 提示，不插入
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ENTRY = join(process.cwd(), 'out', 'main', 'index.js')
const WAIT = 30_000

describe('E2E 拖拽文件入输入框', () => {
  let dataHome: string
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof electron.launch>> extends {
    firstWindow(): Promise<infer T>
  }
    ? T
    : never

  beforeAll(async () => {
    dataHome = mkdtempSync(join(tmpdir(), 'kw-dropfile-'))
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

  /** 通过 CDP 派发真实文件拖拽（带磁盘路径，等价于系统文件管理器拖入） */
  async function cdpDropFile(filePath: string, x: number, y: number): Promise<void> {
    const client = await page.context().newCDPSession(page)
    const data = { items: [], files: [filePath], dragOperationsMask: 1 }
    await client.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data })
    await client.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data })
    await client.send('Input.dispatchDragEvent', { type: 'drop', x, y, data })
    await client.detach()
  }

  it('真实文件拖入：拖拽高亮 → 光标处插入 token（title 为绝对路径）', async () => {
    const samplePath = join(dataHome, 'drag-sample.txt')
    writeFileSync(samplePath, '拖拽附件内容')
    const input = page.locator('.task-textarea').first()
    const box = (await input.boundingBox())!
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    // 拖入瞬间：虚线高亮提示可放置
    const client = await page.context().newCDPSession(page)
    await client.send('Input.dispatchDragEvent', {
      type: 'dragEnter',
      x: cx,
      y: cy,
      data: { items: [], files: [samplePath], dragOperationsMask: 1 }
    })
    await page.locator('.task-textarea--dragging').waitFor({ state: 'visible', timeout: 5_000 })
    await client.send('Input.dispatchDragEvent', {
      type: 'drop',
      x: cx,
      y: cy,
      data: { items: [], files: [samplePath], dragOperationsMask: 1 }
    })
    await client.detach()

    // 高亮消失 + 光标处插入文件 token（title 为绝对路径，与「+ → 本地文件」一致）
    await page.locator('.task-textarea--dragging').waitFor({ state: 'detached', timeout: 5_000 })
    const token = page.locator('.file-token')
    await token.waitFor({ state: 'visible', timeout: 5_000 })
    expect(await token.count()).toBe(1)
    expect(await token.getAttribute('title')).toBe(samplePath)
    expect(await token.locator('.file-token-name').innerText()).toBe('drag-sample.txt')
    // 清理：点击 token 删除（与 + 菜单插入的 token 交互一致）
    await token.click()
    expect(await page.locator('.file-token').count()).toBe(0)
  }, 60_000)

  it('已有文本时拖入：token 插入到拖放点（光标位置）之后', async () => {
    const dropPath = join(dataHome, 'drag-caret.txt')
    writeFileSync(dropPath, '光标位置附件')
    const input = page.locator('.task-textarea').first()
    await input.fill('abc')
    // 拖到输入框右端：caretRangeFromPoint 定位到文本末尾 → token 追加在 'abc' 之后
    const box = (await input.boundingBox())!
    const cx = box.x + box.width - 10
    const cy = box.y + box.height / 2
    await cdpDropFile(dropPath, cx, cy)

    const token = page.locator('.file-token')
    await token.waitFor({ state: 'visible', timeout: 5_000 })
    expect(await input.evaluate((el) => el.childNodes[0]?.textContent)).toBe('abc')
    expect(await input.evaluate((el) => el.lastElementChild?.classList.contains('file-token'))).toBe(
      true
    )
    expect(await token.getAttribute('title')).toBe(dropPath)
  }, 60_000)

  it('无法解析路径的文件（合成 File）拖入：toast 提示，不插入', async () => {
    const before = await page.locator('.file-token').count()
    // 合成 File 无磁盘路径，webUtils.getPathForFile 返回空 → 走 toast 降级分支
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['x'], 'fake.txt'))
      document
        .querySelector('.task-textarea')
        ?.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
    })
    await page.getByText('无法读取文件，请从本地文件夹重新拖入').waitFor({
      state: 'visible',
      timeout: 5_000
    })
    expect(await page.locator('.file-token').count()).toBe(before)
  }, 60_000)
})
