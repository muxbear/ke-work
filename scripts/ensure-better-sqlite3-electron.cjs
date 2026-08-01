'use strict'

/**
 * 持久化修复：确保 node_modules 下所有 better-sqlite3 拷贝都有 Electron ABI 的编译产物
 *
 * 背景：
 * - @langchain/langgraph-checkpoint-sqlite 嵌套的 better-sqlite3 v12.x 是非 N-API 模块，
 *   npm 安装脚本（prebuild-install || node-gyp rebuild）只按当前 Node ABI 产出（或网络失败时
 *   什么都不产出），Electron 主进程（如 Electron 39 = ABI 140）无法加载 → agent init 失败。
 * - better-sqlite3 的 GitHub release 提供各平台/ABI 的预编译包，prebuild-install 可直接下载，
 *   无需本地编译（不需要 VS 工具链 / Electron headers）。
 * - 顶层 v13 是包内自带 N-API 预编译（Node/Electron 通用），脚本自动跳过。
 *
 * 判定逻辑（对每份拷贝）：
 *   包内 prebuilds/<platform>-<arch>.node 存在      → N-API 自足，跳过
 *   绑定缺失 / 0 字节 / 损坏                        → 下载 Electron 预编译包
 *   绑定可被当前 Node 加载（= Node ABI，非目标）    → --force 重新下载
 *   绑定在 Node 下抛 NODE_MODULE_VERSION 不匹配     → 正是 Electron ABI，跳过
 *
 * 依赖：node_modules/electron（读版本）、node_modules/prebuild-install（下载器，
 * 由 better-sqlite3 自身依赖提升而来）。
 */
const { execFileSync } = require('child_process')
const { existsSync, readdirSync, statSync } = require('fs')
const { join, resolve, relative } = require('path')

const rootDir = resolve(__dirname, '..')

const electronPkgPath = join(rootDir, 'node_modules', 'electron', 'package.json')
const prebuildInstallEntry = join(rootDir, 'node_modules', 'prebuild-install', 'bin.js')

if (!existsSync(electronPkgPath)) {
  throw new Error('[better-sqlite3] 未找到 node_modules/electron，请先执行 npm install')
}
if (!existsSync(prebuildInstallEntry)) {
  throw new Error(
    '[better-sqlite3] 未找到 node_modules/prebuild-install/bin.js，请重新执行 npm install'
  )
}

const electronVersion = require(electronPkgPath).version
const platform = process.platform
const arch = process.arch

/** 遍历 node_modules，找出所有 better-sqlite3 包目录（顶层 + 任意嵌套） */
function findBetterSqlite3Dirs(dir, found = []) {
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const p = join(dir, entry.name)
    if (entry.name === 'better-sqlite3') {
      if (existsSync(join(p, 'package.json'))) found.push(p)
      continue
    }
    if (
      entry.name === 'node_modules' ||
      entry.name.startsWith('@') ||
      existsSync(join(p, 'node_modules'))
    ) {
      findBetterSqlite3Dirs(p, found)
    }
  }
  return found
}

/** 探测绑定状态：missing | node-abi（Node 可加载）| electron-abi（Node 拒绝=Electron ABI）| corrupt */
function probeBinding(bindingPath) {
  if (!existsSync(bindingPath) || statSync(bindingPath).size === 0) return 'missing'
  // 用独立子进程加载：DLL 一旦被本进程加载，Windows 上会被锁定，prebuild-install 无法覆盖写入
  try {
    execFileSync(process.execPath, ['-e', `require(${JSON.stringify(bindingPath)})`], {
      stdio: 'pipe'
    })
    return 'node-abi'
  } catch (e) {
    const msg = String(e.stderr || e.message)
    return /NODE_MODULE_VERSION/.test(msg) ? 'electron-abi' : 'corrupt'
  }
}

const dirs = findBetterSqlite3Dirs(join(rootDir, 'node_modules'))
if (dirs.length === 0) {
  console.log('[better-sqlite3] node_modules 中未找到 better-sqlite3，无需处理')
  process.exit(0)
}

console.log(`[better-sqlite3] Electron ${electronVersion}（${platform}-${arch}），共 ${dirs.length} 份拷贝`)

let changed = 0
for (const pkgDir of dirs) {
  const label = relative(rootDir, pkgDir)
  // 包内自带 prebuilds（N-API）→ 运行时自足，无需处理
  if (existsSync(join(pkgDir, 'prebuilds', `${platform}-${arch}.node`))) {
    console.log(`[better-sqlite3] ${label}: 包内 N-API 预编译，跳过`)
    continue
  }
  const bindingPath = join(pkgDir, 'build', 'Release', 'better_sqlite3.node')
  const state = probeBinding(bindingPath)
  if (state === 'electron-abi') {
    console.log(`[better-sqlite3] ${label}: Electron ABI 绑定已就位，跳过`)
    continue
  }
  console.log(
    `[better-sqlite3] ${label}: ${state} → 下载 Electron ${electronVersion} 预编译包...`
  )
  const args = ['--runtime=electron', `--target=${electronVersion}`]
  if (state !== 'missing') args.push('--force')
  execFileSync(process.execPath, [prebuildInstallEntry, ...args], {
    cwd: pkgDir,
    stdio: 'inherit'
  })
  const after = probeBinding(bindingPath)
  if (after !== 'electron-abi') {
    throw new Error(`[better-sqlite3] ${label}: 下载后绑定仍为 ${after}，请手动检查网络与版本`)
  }
  console.log(`[better-sqlite3] ${label}: 完成（Electron ABI）`)
  changed++
}

if (changed > 0) console.log(`[better-sqlite3] 共修复 ${changed} 份拷贝`)
else console.log('[better-sqlite3] 无需修复')
