# 登录页面重构 — 设计规格文档

## 概述

基于 Figma 设计稿（[qingluan-desktop](https://www.figma.com/make/slZPuFixjcrUBFhVmHq6yL/qingluan-desktop)）对登录页面进行像素级重构，将当前深色主题+蓝色强调的设计替换为浅色主题+青色（teal/cyan）毛玻璃风格。

## 技术约束

- **技术栈**：Electron + Vite + Vue 3 + TypeScript（与项目一致）
- **样式方案**：Scoped CSS，不引入 Tailwind（保持项目现有约定）
- **动画方案**：Vue 内置 `<Transition>` 组件 + CSS transition，零额外依赖
- **字体**：Noto Sans SC（中文）+ Inter（拉丁），通过 Google Fonts 加载

## 设计令牌

所有样式变量定义在 Login.vue 的 `<style scoped>` 中：

| 变量 | 值 | 用途 |
|------|-----|------|
| `--brand-400` | `#22d3ee` | Logo 浅色渐变 |
| `--brand-500` | `#06b6d4` | 装饰元素 |
| `--brand-600` | `#0891b2` | 按钮背景、输入框边框、图标 |
| `--brand-700` | `#0e7490` | 标题文字、按钮渐变终点 |
| `--bg-page-start` | `#e0f2f8` | 页面背景渐变起点 |
| `--bg-page-mid` | `#f0f9ff` | 页面背景渐变中点 |
| `--bg-page-end` | `#ecfeff` | 页面背景渐变终点 |
| `--card-bg` | `rgba(255,255,255,0.92)` | 卡片背景 |
| `--card-border` | `rgba(255,255,255,0.8)` | 卡片边框 |
| `--input-bg` | `#f5f9fb` | 输入框背景 |
| `--input-border` | `rgba(8,145,178,0.2)` | 输入框边框 |
| `--tab-bg` | `#f0f6fa` | 标签栏背景 |
| `--text-title` | `#0e7490` | 标题文字颜色 |
| `--text-subtitle` | `#6b7f95` | 副标题文字颜色 |
| `--text-muted` | `#94a3b8` | 次要文字、占位符 |
| `--wechat-500` | `#07c160` | 微信按钮主色 |
| `--wechat-600` | `#059652` | 微信按钮渐变终点 |
| `--error-600` | `#dc2626` | 错误状态颜色 |
| `--radius-card` | `24px` | 卡片圆角 |
| `--radius-tab` | `12px` | 标签栏/按钮圆角 |
| `--radius-input` | `12px` | 输入框圆角 |
| `--font-base` | `16px` | 基准字号 |
| `--shadow-card` | `0 20px 60px rgba(8,145,178,0.12), 0 8px 24px rgba(0,0,0,0.06)` | 卡片阴影 |
| `--shadow-btn` | `0 4px 15px rgba(8,145,178,0.35)` | 登录按钮阴影 |
| `--shadow-tab` | `0 1px 4px rgba(8,145,178,0.15)` | 标签指示器阴影 |

## 组件结构

```
Login.vue
├── .login-page              → 全屏渐变背景 + 两个装饰圆（radial-gradient）
└── .login-card              → 毛玻璃卡片 (backdrop-filter: blur, max-width: 400px)
    ├── .card-header         → 青鸾 SVG Logo (68px) + "青鸾" (24px Bold) + 副标题 (14px)
    ├── .card-tabs           → 三个标签 + CSS transition 滑动指示器
    ├── .card-body           → <Transition name="fade-slide" mode="out-in">
    │   ├── PhoneLoginForm   → +86 前缀 | 手机号输入 | 验证码 + 发送按钮
    │   ├── PasswordLoginForm → 用户图标 | 账号输入 | 密码输入 + 眼睛切换 | 忘记密码
    │   └── WeChatLoginForm  → 微信图标区域 (dashed border) | 绿色授权按钮
    ├── .card-footer         → 隐私政策 · 服务条款 · 帮助中心 (12px)
    └── .version             → v1.0.0 (12px, 卡片外)
    
SlideCaptcha.vue (样式更新)   → 青色主题验证码弹窗
```

## 标签页动画

### 指示器动画
- 使用 CSS `transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)` 实现弹性滑动
- 通过计算当前激活标签的 `offsetLeft` 动态设置指示器的 `transform: translateX()`

### 内容切换
- 使用 Vue `<Transition name="fade-slide" mode="out-in">`
- 入场：从右(+10px)淡入，180ms
- 出场：向左(-10px)淡出，180ms

## 交互逻辑（保留不变）

以下业务逻辑完全保持不变：

1. **手机验证码登录**：手机号校验 → 发验证码 → 输入验证码 → 滑块验证 → API 调用
2. **密码登录**：账号校验 → 密码校验 → 滑块验证 → API 调用
3. **微信授权**：打开系统浏览器 OAuth → 回调处理 → 换 token → 登录
4. **滑块验证码**：Pointer Events 拖拽验证
5. **表单校验**：手机号 `/^1[3-9]\d{9}$/`，密码 ≥ 6 位
6. **Pinia Store**：`useUserStore` 令牌和用户信息管理
7. **Hash Router**：`createWebHashHistory` + 导航守卫
8. **Mock 模式**：`VITE_USE_MOCK` 环境变量控制

## 新增 UI 元素

| 元素 | 位置 | 说明 |
|------|------|------|
| 青鸾 SVG Logo | 卡片头部 | 内联 SVG，68px，青-蓝绿渐变 |
| "忘记密码？" 链接 | 密码表单底部 | 右对齐，`#0891b2`，12px |
| 隐私政策 / 服务条款 / 帮助中心 | 卡片底部 | 居中排列，`#94a3b8`，12px，分隔符 `·` |
| 版本号 v1.0.0 | 卡片下方 | 居中，`#94a3b8`，12px |
| API 错误提示 | 密码表单中 | 红色背景卡片，左侧 X 图标 |

## 响应式设计

| 视口宽度 | 卡片表现 |
|----------|----------|
| > 440px | max-width: 400px，水平居中，padding: 32px |
| 360px ~ 440px | 自动宽度，margin: 16px，padding: 24px |
| < 360px | 满宽，padding: 16px，字号不缩放（最小可读） |

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/renderer/src/views/Login.vue` | 重写 | Template + Style 完全重写，Script 逻辑保留 |
| `src/renderer/src/components/SlideCaptcha.vue` | 样式更新 | 颜色改为青色主题 |
| `src/renderer/index.html` | 修改 | 添加 Google Fonts `<link>` |
| `src/renderer/src/assets/main.css` | 微调 | 移除深色背景与组件的冲突 |

## 验收标准

1. 页面视觉与 Figma 设计稿一致（布局、颜色、字体、间距）
2. 三个标签切换动画流畅（弹簧效果 + 淡入滑动）
3. 表单校验提示正确显示
4. 滑块验证码正常工作
5. 登录成功后正确跳转 `/home`
6. 窗口缩放到 320px ~ 1920px 范围内布局正常
7. 无额外 npm 依赖引入
