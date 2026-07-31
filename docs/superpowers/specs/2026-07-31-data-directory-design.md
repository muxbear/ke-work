# .ke-work 数据目录管理 — 设计文档

**日期**: 2026-07-31
**状态**: 已确认

## 1. 需求概述

应用启动时根据操作系统类型，确保用户家目录下存在 `.ke-work` 数据目录，并以该目录为基础目录管理所有应用数据。

### 1.1 支持的操作系统

通过 `process.platform` + `/etc/os-release` 组合检测以下系统：

| 系统 | 检测方式 | 标识 |
|------|---------|------|
| Windows | `process.platform === 'win32'` | `windows` |
| macOS | `process.platform === 'darwin'` | `macos` |
| Ubuntu | `/etc/os-release` → `ID=ubuntu` | `ubuntu` |
| 统信UOS | `/etc/os-release` → `ID=uos` 或 `ID=deepin` | `uos` |
| KylinOS | `/etc/os-release` → `ID=kylin` | `kylin` |
| HarmonyOS | `/etc/os-release` → `ID=openharmony` | `harmonyos` |
| 其他 Linux | 降级处理 | `linux` |

### 1.2 目录结构

```
~/.ke-work/
├── conversations/    # Agent 对话历史
├── logs/             # 应用日志
├── config/           # 用户配置/偏好
└── cache/            # 缓存数据（模型缓存等）
```

## 2. 模块设计

### 2.1 文件结构

```
src/main/
├── index.ts              # [修改] 启动时调用初始化
├── platform.ts           # [新增] OS 类型检测
├── data-dir.ts           # [新增] 数据目录管理（单例）
├── agent/
│   ├── agent.ts
│   └── service.ts
```

### 2.2 `platform.ts` — OS 类型检测

**职责**: 返回标准化的操作系统标识，结果缓存至模块级变量。

**导出类型**:
```typescript
type OSType = 'windows' | 'macos' | 'ubuntu'
            | 'uos' | 'kylin' | 'harmonyos' | 'linux'
```

**导出函数**:
- `detectOS(): OSType` — 执行检测，缓存结果
- `getOSType(): OSType` — 获取已缓存的检测结果

**检测逻辑**:
1. `process.platform === 'win32'` → `'windows'`
2. `process.platform === 'darwin'` → `'macos'`
3. `process.platform === 'linux'` → 读取 `/etc/os-release`，解析 `ID=` 字段
   - `uos` / `deepin` → `'uos'`
   - `kylin` → `'kylin'`
   - `ubuntu` → `'ubuntu'`
   - `openharmony` → `'harmonyos'`
   - 其他/解析失败 → `'linux'`

**关键实现细节**:
- `parseOSRelease()` 使用 `fs.readFileSync` 同步读取，正则匹配 `/^ID="?([^"\n]+)"?$/m`
- 文件不存在时返回 `undefined`，降级为 `'linux'`
- 整个检测是一次性的（模块加载时执行），后续调用直接返回缓存

### 2.3 `data-dir.ts` — 数据目录管理

**职责**: 作为单例管理 `.ke-work` 基础目录及其子目录，提供路径获取接口。

**导出类型**:
```typescript
const SUB_DIRS = ['conversations', 'logs', 'config', 'cache'] as const
type SubDir = (typeof SUB_DIRS)[number]
```

**DataDirectory 类**:
- `getBaseDir(): string` — 返回 `~/.ke-work/`
- `getDir(sub: SubDir): string` — 返回 `~/.ke-work/<sub>/`
- `ensureDir(sub: SubDir): string` — 确保某个子目录存在（懒初始化），返回路径
- `ensureAll(): void` — 一次性创建所有子目录

**导出函数**:
- `getDataDirectory(): DataDirectory` — 获取单例（需提前调用 initDataDirectory）
- `initDataDirectory(): DataDirectory` — 初始化：创建基础目录 + 所有子目录，返回单例

**初始化流程** (`initDataDirectory`):
1. `basePath = path.join(os.homedir(), '.ke-work')`
2. `fs.existsSync(basePath)` → 不存在则 `fs.mkdirSync({ recursive: true })`
3. 遍历 `SUB_DIRS`，对每个子目录调用 `fs.mkdirSync`
4. 创建 `DataDirectory` 单例实例

**关键实现细节**:
- 单例模式，全局唯一实例
- 基础目录在 `initDataDirectory` 中预创建，子目录支持按需 `ensureDir`
- 所有路径使用 `path.join` 确保跨平台兼容
- 仅主进程内部使用，不暴露给渲染进程

### 2.4 `index.ts` 修改点

在 `app.whenReady().then()` 回调的**最前面**增加：

```typescript
// 初始化数据目录
initDataDirectory()
```

确保在任何业务逻辑执行前，数据目录已就绪。

## 3. 数据流

```
应用启动
  │
  ▼
app.whenReady()
  │
  ├── initDataDirectory()     ─── detectOS() 按需调用
  │     ├── 确定 ~/.ke-work
  │     ├── 创建基础目录
  │     └── 创建子目录
  │            (conversations/ logs/ config/ cache/)
  │
  ├── electronApp.setAppUserModelId(...)
  ├── ipcMain.handle(...)
  └── createWindow()
```

## 4. 错误处理

- **OS 检测失败**: 降级为 `'linux'`（Linux 平台）或原始 `process.platform` 值
- **目录创建失败**: 同步抛出异常，阻止应用启动（数据目录是必需的基础设施）
- **子目录缺失**: 使用前可调用 `ensureDir` 补救创建

## 5. 测试要点

- `detectOS()` 在各平台上返回正确的 OSType
- `/etc/os-release` 文件不存在时降级为 `'linux'`
- `initDataDirectory()` 在目录不存在时正确创建
- `initDataDirectory()` 在目录已存在时不报错
- 跨平台路径分隔符正确（Windows `\` vs Linux `/`）
