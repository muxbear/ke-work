<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/user'
import { exchangeWechatCode, loginByPassword, loginBySms, sendSmsCode } from '../api/auth'
import SlideCaptcha from '../components/SlideCaptcha.vue'

const router = useRouter()
const userStore = useUserStore()

const workMode = ref<'local' | 'cloud'>('local')
const activeTab = ref<'sms' | 'password' | 'wechat'>('sms')
const smsMobile = ref('')
const smsCode = ref('')
const account = ref('')
const password = ref('')
const showPassword = ref(false)
const countdown = ref(0)
const captchaOpen = ref(false)
const loading = ref(false)
const error = ref('')
const wechatPrompt = ref('')

// Field-level errors (matching Figma design)
const phoneError = ref('')
const codeError = ref('')
const accountError = ref('')
const pwdError = ref('')
const apiError = ref('')

const tabs = [
  { key: 'sms' as const, label: '验证码' },
  { key: 'password' as const, label: '密码登录' },
  { key: 'wechat' as const, label: '微信' }
]

const activeTabIndex = computed(() => tabs.findIndex((t) => t.key === activeTab.value))
const indicatorStyle = computed(() => ({
  transform: `translateX(${activeTabIndex.value * 100}%)`
}))

const smsValid = computed(() => /^1[3-9]\d{9}$/.test(smsMobile.value))
const accountValid = computed(
  () => /^1\d{10}$/.test(account.value) || account.value.trim().length > 0
)
const passwordValid = computed(() => password.value.length >= 6)
const canSendSms = computed(() => smsValid.value && countdown.value === 0 && !loading.value)
const canLoginSms = computed(
  () => smsValid.value && smsCode.value.trim().length > 0 && !loading.value
)
const canLoginPassword = computed(() => accountValid.value && passwordValid.value && !loading.value)
const countdownText = computed((): string =>
  countdown.value > 0 ? `${countdown.value}s 后重发` : '发送验证码'
)

const startCountdown = (): void => {
  countdown.value = 60
  const timer = window.setInterval(() => {
    if (countdown.value <= 1) {
      window.clearInterval(timer)
      countdown.value = 0
    } else {
      countdown.value -= 1
    }
  }, 1000)
}

const handleSendSms = (): void => {
  if (!smsValid.value) {
    phoneError.value = '请输入正确的11位中国大陆手机号'
    return
  }
  phoneError.value = ''
  error.value = ''
  captchaOpen.value = true
}

const handleCaptchaVerified = async (): Promise<void> => {
  captchaOpen.value = false
  loading.value = true
  try {
    await sendSmsCode(smsMobile.value)
    startCountdown()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = message || '发送验证码失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

const handleLogin = async (): Promise<void> => {
  error.value = ''
  apiError.value = ''
  phoneError.value = ''
  codeError.value = ''
  accountError.value = ''
  pwdError.value = ''

  if (activeTab.value === 'sms') {
    if (!smsValid.value) {
      phoneError.value = '请输入正确的手机号'
      return
    }
    if (smsCode.value.length < 4) {
      codeError.value = '请输入验证码'
      return
    }
    loading.value = true
    try {
      const result = await loginBySms(smsMobile.value, smsCode.value)
      userStore.setToken(result.token)
      userStore.setUserInfo(result.user)
      router.push('/home')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error.value = message || '登录失败，请稍后重试。'
    } finally {
      loading.value = false
    }
    return
  }

  if (activeTab.value === 'password') {
    if (!account.value.trim()) {
      accountError.value = '请输入账号或手机号'
      return
    }
    if (password.value.length < 6) {
      pwdError.value = '密码不少于6位'
      return
    }
    loading.value = true
    try {
      const result = await loginByPassword(account.value, password.value)
      userStore.setToken(result.token)
      userStore.setUserInfo(result.user)
      router.push('/home')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      apiError.value = message || '账号或密码错误，请重试'
    } finally {
      loading.value = false
    }
    return
  }

  handleWechatLogin()
}

const handleWechatLogin = async (): Promise<void> => {
  error.value = ''
  wechatPrompt.value = '正在打开微信授权页面，请完成授权。'
  loading.value = true

  const appId = import.meta.env.VITE_WECHAT_APPID || 'YOUR_APPID'
  const redirectUri =
    import.meta.env.VITE_WECHAT_REDIRECT_URI || 'https://your-callback.example.com/callback'
  const authUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=snsapi_login&state=desktop`

  try {
    const result = await window.api.openWeChatAuth(authUrl, redirectUri)
    if (result.error) {
      throw new Error(result.error)
    }
    if (!result.code) {
      throw new Error('未获取到微信授权 code。')
    }

    const response = await exchangeWechatCode(result.code)
    userStore.setToken(response.token)
    userStore.setUserInfo(response.user)
    router.push('/home')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = message || '微信授权失败，请重试。'
  } finally {
    loading.value = false
    wechatPrompt.value = ''
  }
}
</script>

<template>
  <div class="login-page">
    <!-- Decorative radial gradient circles -->
    <div class="decor decor--tl"></div>
    <div class="decor decor--br"></div>

    <!-- Main card -->
    <div class="login-card">
      <!-- Header: Logo + Title -->
      <div class="card-header">
        <svg class="logo" width="68" height="68" viewBox="0 0 64 64" fill="none">
          <defs>
            <linearGradient id="qlg1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#06b6d4" />
              <stop offset="100%" stop-color="#0e7490" />
            </linearGradient>
            <linearGradient id="qlg2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#22d3ee" />
              <stop offset="100%" stop-color="#0891b2" />
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="38" rx="12" ry="14" fill="url(#qlg1)" />
          <circle cx="32" cy="20" r="9" fill="url(#qlg1)" />
          <path d="M32 11 C28 5 24 3 22 6 C26 7 29 9 32 11Z" fill="url(#qlg2)" />
          <path d="M32 11 C32 4 35 1 38 4 C35 6 33 8 32 11Z" fill="#06b6d4" />
          <path d="M20 34 C10 26 8 32 10 38 C14 36 17 35 20 34Z" fill="url(#qlg2)" opacity="0.9" />
          <path d="M20 34 C8 30 6 24 10 22 C13 28 16 31 20 34Z" fill="#22d3ee" opacity="0.7" />
          <path d="M44 34 C54 26 56 32 54 38 C50 36 47 35 44 34Z" fill="url(#qlg2)" opacity="0.9" />
          <path d="M44 34 C56 30 58 24 54 22 C51 28 48 31 44 34Z" fill="#22d3ee" opacity="0.7" />
          <path d="M28 50 C24 56 20 60 18 58 C20 54 24 52 28 50Z" fill="#0891b2" opacity="0.8" />
          <path d="M32 52 C32 58 30 63 28 62 C29 58 30 55 32 52Z" fill="#06b6d4" opacity="0.9" />
          <path d="M36 50 C40 56 44 60 46 58 C44 54 40 52 36 50Z" fill="#0891b2" opacity="0.8" />
          <circle cx="29" cy="19" r="2.5" fill="white" />
          <circle cx="29.5" cy="19" r="1.2" fill="#0e7490" />
          <path d="M32 25 L29 28 L35 28Z" fill="#f0fdff" />
        </svg>
        <h1 class="title">KE-WORK</h1>
        <p class="subtitle">ke-work · 和你一起工作</p>
      </div>

      <!-- Work mode selector -->
      <div class="work-mode-bar">
        <label :class="['work-mode-option', { 'work-mode-option--active': workMode === 'local' }]">
          <input
            v-model="workMode"
            type="radio"
            value="local"
            class="work-mode-radio"
          />
          <span class="work-mode-label">本地工作</span>
        </label>
        <label :class="['work-mode-option', { 'work-mode-option--active': workMode === 'cloud' }]">
          <input
            v-model="workMode"
            type="radio"
            value="cloud"
            class="work-mode-radio"
          />
          <span class="work-mode-label">云端工作</span>
        </label>
      </div>

      <!-- Tabs -->
      <div class="card-tabs">
        <div class="tabs-track">
          <div class="tab-indicator" :style="indicatorStyle"></div>
          <button
            v-for="tab in tabs"
            :key="tab.key"
            :class="['tab-btn', { 'tab-btn--active': activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- Form body with transition -->
      <div class="card-body">
        <Transition name="fade-slide" mode="out-in">
          <!-- SMS Login -->
          <div v-if="activeTab === 'sms'" key="sms" class="form-panel">
            <!-- Phone input -->
            <div class="field">
              <div :class="['input-row', { 'input-row--error': phoneError }]">
                <span class="input-prefix">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 3.07 4.18 2 2 0 0 1 5 2h3a2 2 0 0 1 2 1.72 12.18 12.18 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L9.91 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.18 12.18 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"
                    />
                  </svg>
                  <span class="prefix-text">+86</span>
                </span>
                <input
                  v-model="smsMobile"
                  type="tel"
                  placeholder="请输入手机号"
                  maxlength="11"
                  class="input-main"
                  @input="phoneError = ''"
                />
              </div>
              <p v-if="phoneError" class="field-error">{{ phoneError }}</p>
            </div>

            <!-- SMS code input -->
            <div class="field">
              <div :class="['input-row', { 'input-row--error': codeError }]">
                <input
                  v-model="smsCode"
                  type="text"
                  placeholder="请输入验证码"
                  maxlength="6"
                  class="input-main"
                  @input="codeError = ''"
                />
                <button class="send-code-btn" :disabled="!canSendSms" @click="handleSendSms">
                  {{ countdownText }}
                </button>
              </div>
              <p v-if="codeError" class="field-error">{{ codeError }}</p>
            </div>

            <!-- Login button -->
            <button class="login-btn" :disabled="!canLoginSms || loading" @click="handleLogin">
              {{ loading ? '登录中…' : '登录' }}
            </button>

            <p v-if="error" class="global-error">{{ error }}</p>
          </div>

          <!-- Password Login -->
          <div v-else-if="activeTab === 'password'" key="password" class="form-panel">
            <!-- Account input -->
            <div class="field">
              <div :class="['input-row', { 'input-row--error': accountError }]">
                <input
                  v-model="account"
                  type="text"
                  placeholder="手机号 / 用户名"
                  class="input-main"
                  @input="accountError = ''"
                />
              </div>
              <p v-if="accountError" class="field-error">{{ accountError }}</p>
            </div>

            <!-- Password input -->
            <div class="field">
              <div :class="['input-row', { 'input-row--error': pwdError }]">
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="请输入密码（至少6位）"
                  class="input-main"
                  @input="pwdError = ''"
                />
                <button class="toggle-pwd-btn" @click="showPassword = !showPassword">
                  <svg
                    v-if="showPassword"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                    />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  <svg
                    v-else
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
              <p v-if="pwdError" class="field-error">{{ pwdError }}</p>
            </div>

            <!-- API error -->
            <div v-if="apiError" class="api-error">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>{{ apiError }}</span>
            </div>

            <!-- Forgot password -->
            <div class="forgot-row">
              <button class="forgot-link">忘记密码？</button>
            </div>

            <!-- Login button -->
            <button class="login-btn" :disabled="!canLoginPassword || loading" @click="handleLogin">
              {{ loading ? '登录中…' : '登录' }}
            </button>
          </div>

          <!-- WeChat Login -->
          <div v-else key="wechat" class="form-panel wechat-panel">
            <!-- QR placeholder area -->
            <div class="wechat-qr-area">
              <div v-if="loading" class="wechat-loading">
                <div class="spinner"></div>
                <p>等待授权…</p>
              </div>
              <div v-else class="wechat-prompt">
                <div class="wechat-icon-circle">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c.048.213-.13.295-.295.295a.326.326 0 0 1-.167-.054l-1.903-1.114a.864.864 0 0 0-.717-.098 10.16 10.16 0 0 1-2.837.403c-.276 0-.543-.027-.811-.05.857-2.578-.157-4.972-1.932-6.446C1.703 8.773 3.882 8.208 5.853 8.066c-.576 3.583 3.898 6.348 7.601 6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-2.324 0c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-2.324 0c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.49.49 0 0 1 .189-.467C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.062-6.122zm-3.74 2.532a.965.965 0 0 1 0 1.928.965.965 0 0 1 0-1.928zm4.861 0a.965.965 0 0 1 0 1.928.965.965 0 0 1 0-1.928z"
                    />
                  </svg>
                </div>
                <p class="wechat-desc">使用微信扫码<br />或点击下方按钮授权</p>
              </div>
            </div>

            <!-- WeChat login button -->
            <button class="wechat-btn" :disabled="loading" @click="handleWechatLogin">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c.048.213-.13.295-.295.295a.326.326 0 0 1-.167-.054l-1.903-1.114a.864.864 0 0 0-.717-.098 10.16 10.16 0 0 1-2.837.403c-.276 0-.543-.027-.811-.05.857-2.578-.157-4.972-1.932-6.446C1.703 8.773 3.882 8.208 5.853 8.066c-.576 3.583 3.898 6.348 7.601 6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-2.324 0c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-2.324 0c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.49.49 0 0 1 .189-.467C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.062-6.122zm-3.74 2.532a.965.965 0 0 1 0 1.928.965.965 0 0 1 0-1.928zm4.861 0a.965.965 0 0 1 0 1.928.965.965 0 0 1 0-1.928z"
                />
              </svg>
              {{ loading ? '授权中…' : '微信授权登录' }}
            </button>

            <p v-if="wechatPrompt" class="wechat-hint">{{ wechatPrompt }}</p>
            <p v-else class="wechat-hint">
              点击后将打开微信 OAuth 授权页面<br />授权后自动完成登录
            </p>
          </div>
        </Transition>
      </div>

      <!-- Footer links -->
      <div class="card-footer">
        <button class="footer-link">隐私政策</button>
        <span class="footer-dot">·</span>
        <button class="footer-link">服务条款</button>
        <span class="footer-dot">·</span>
        <button class="footer-link">帮助中心</button>
      </div>
    </div>

    <!-- Version -->
    <p class="version-text">v1.0.0</p>

    <SlideCaptcha
      v-if="captchaOpen"
      @verified="handleCaptchaVerified"
      @close="captchaOpen = false"
    />
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   Design Tokens
   ═══════════════════════════════════════════════════════════════════════════ */
.login-page {
  --brand-400: #22d3ee;
  --brand-500: #06b6d4;
  --brand-600: #0891b2;
  --brand-700: #0e7490;
  --bg-page-start: #e0f2f8;
  --bg-page-mid: #f0f9ff;
  --bg-page-end: #ecfeff;
  --card-bg: rgba(255, 255, 255, 0.92);
  --card-border: rgba(255, 255, 255, 0.8);
  --card-shadow: 0 20px 60px rgba(8, 145, 178, 0.12), 0 8px 24px rgba(0, 0, 0, 0.06);
  --input-bg: #f5f9fb;
  --input-border: rgba(8, 145, 178, 0.2);
  --input-border-focus: #0891b2;
  --tab-bg: #f0f6fa;
  --tab-shadow: 0 1px 4px rgba(8, 145, 178, 0.15);
  --text-title: #0e7490;
  --text-subtitle: #6b7f95;
  --text-muted: #94a3b8;
  --text-placeholder: #9ca3af;
  --wechat-500: #07c160;
  --wechat-600: #059652;
  --error-50: #fef2f2;
  --error-200: #fecaca;
  --error-500: #ef4444;
  --error-600: #dc2626;
  --radius-card: 24px;
  --radius-tab: 12px;
  --radius-input: 12px;
  --radius-btn: 12px;
  --font-base: 16px;
  --shadow-btn: 0 4px 15px rgba(8, 145, 178, 0.35);
  --shadow-wechat-btn: 0 4px 15px rgba(7, 193, 96, 0.3);
  --transition-tab: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Page Layout
   ═══════════════════════════════════════════════════════════════════════════ */
.login-page {
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: linear-gradient(
    135deg,
    var(--bg-page-start) 0%,
    var(--bg-page-mid) 40%,
    var(--bg-page-end) 100%
  );
  position: relative;
  overflow: hidden;
  font-family:
    'Inter',
    'Noto Sans SC',
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
}

/* Decorative radial gradient circles */
.decor {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.decor--tl {
  top: -128px;
  left: -128px;
  width: 384px;
  height: 384px;
  background: radial-gradient(circle, var(--brand-500), transparent 70%);
  opacity: 0.3;
}

.decor--br {
  bottom: -96px;
  right: -96px;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, var(--brand-600), transparent 70%);
  opacity: 0.2;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Card
   ═══════════════════════════════════════════════════════════════════════════ */
.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px;
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: var(--radius-card);
  border: 1px solid var(--card-border);
  box-shadow: var(--card-shadow);
  overflow: hidden;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Card Header
   ═══════════════════════════════════════════════════════════════════════════ */
.card-header {
  padding: 32px 32px 20px;
  text-align: center;
  background: linear-gradient(180deg, rgba(240, 253, 255, 0.8), transparent);
}

.logo {
  display: block;
  margin: 0 auto 10px;
}

.title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-title);
  letter-spacing: -0.5px;
  margin: 0;
  line-height: 1.4;
}

.subtitle {
  font-size: 14px;
  color: var(--text-subtitle);
  margin: 4px 0 0;
  line-height: 1.5;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Work Mode Selector
   ═══════════════════════════════════════════════════════════════════════════ */
.work-mode-bar {
  display: flex;
  gap: 8px;
  padding: 0 32px 0;
  margin-bottom: 16px;
}

.work-mode-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 0;
  border-radius: var(--radius-tab);
  background: var(--tab-bg);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.work-mode-option--active {
  background: #ffffff;
  box-shadow: var(--tab-shadow);
}

.work-mode-radio {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(8, 145, 178, 0.3);
  margin: 0;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
  position: relative;
}

.work-mode-radio:checked {
  border-color: var(--brand-600);
  border-width: 5px;
}

.work-mode-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-subtitle);
  transition: color 0.2s ease;
}

.work-mode-option--active .work-mode-label {
  color: var(--text-title);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tabs
   ═══════════════════════════════════════════════════════════════════════════ */
.card-tabs {
  padding: 0 32px;
}

.tabs-track {
  display: flex;
  position: relative;
  background: var(--tab-bg);
  border-radius: var(--radius-tab);
  padding: 4px;
  gap: 4px;
}

.tab-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  bottom: 4px;
  width: calc((100% - 8px) / 3);
  background: #ffffff;
  border-radius: 8px;
  box-shadow: var(--tab-shadow);
  transition: var(--transition-tab);
  z-index: 0;
}

.tab-btn {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 12px 0;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--text-subtitle);
  cursor: pointer;
  transition: color 0.25s ease;
}

.tab-btn--active {
  color: var(--text-title);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Card Body / Form
   ═══════════════════════════════════════════════════════════════════════════ */
.card-body {
  padding: 24px 32px 30px;
  min-height: 280px;
}

.form-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Field */
.field {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Input row */
.input-row {
  display: flex;
  align-items: center;
  border: 1px solid rgba(8, 145, 178, 0.18);
  border-radius: var(--radius-input);
  background: var(--input-bg);
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.input-row:hover {
  border-color: rgba(8, 145, 178, 0.3);
  box-shadow: 0 0 0 1px rgba(8, 145, 178, 0.08);
}

.input-row:focus-within {
  border-color: var(--input-border-focus);
  background: #ffffff;
}

.input-row--error {
  border-color: var(--error-200);
  background: var(--error-50);
}

/* Input prefix (e.g. +86) */
.input-prefix {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  color: #0e7490;
  border-right: 1px solid rgba(8, 145, 178, 0.16);
  white-space: nowrap;
}

.input-prefix svg {
  color: #06b6d4;
}

.prefix-text {
  font-size: 14px;
  font-weight: 600;
  color: #0f766e;
}

/* Input icon */
.input-icon {
  display: flex;
  align-items: center;
  padding: 0 14px;
  color: #94a3b8;
}

/* Main input */
.input-main {
  flex: 1;
  padding: 16px 14px;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  font-family: inherit;
  color: #1e293b;
  min-width: 0;
}

.input-main::placeholder {
  color: var(--text-placeholder);
}

/* Send code button */
.send-code-btn {
  padding: 10px 16px;
  border: 1px solid rgba(8, 145, 178, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--brand-700);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition:
    transform 0.15s ease,
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.send-code-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(8, 145, 178, 0.3);
}

.send-code-btn:disabled {
  color: var(--text-muted);
  border-color: rgba(148, 163, 184, 0.2);
  background: rgba(255, 255, 255, 0.75);
  cursor: not-allowed;
}

/* Toggle password button */
.toggle-pwd-btn {
  display: flex;
  align-items: center;
  padding: 11px 12px;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  transition: color 0.15s ease;
}

.toggle-pwd-btn:hover {
  color: #374151;
}

/* Field error message */
.field-error {
  font-size: 12px;
  color: var(--error-500);
  margin: 4px 0 0 4px;
  line-height: 1.4;
}

/* API error (full width) */
.api-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--error-50);
  border: 1px solid var(--error-200);
  border-radius: 10px;
  color: var(--error-600);
  font-size: 13px;
  line-height: 1.4;
}

.api-error svg {
  flex-shrink: 0;
  color: var(--error-500);
}

/* Forgot password link */
.forgot-row {
  display: flex;
  justify-content: flex-end;
}

.forgot-link {
  border: none;
  background: transparent;
  color: var(--brand-600);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}

/* Login button */
.login-btn {
  width: 100%;
  min-height: 52px;
  padding: 0 20px;
  border: none;
  border-radius: var(--radius-btn);
  background: linear-gradient(135deg, var(--brand-600), var(--brand-700));
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--shadow-btn);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    opacity 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.login-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.login-btn:disabled {
  background: var(--text-muted);
  box-shadow: none;
  cursor: not-allowed;
}

/* Global error message (mainly for SMS form) */
.global-error {
  text-align: center;
  color: var(--error-500);
  font-size: 13px;
  margin: 0;
  line-height: 1.4;
}

/* ═══════════════════════════════════════════════════════════════════════════
   WeChat Panel
   ═══════════════════════════════════════════════════════════════════════════ */
.wechat-panel {
  align-items: center;
}

.wechat-qr-area {
  width: 160px;
  height: 160px;
  border-radius: 16px;
  background: linear-gradient(135deg, #f0fdff, #e0f2f8);
  border: 2px dashed rgba(8, 145, 178, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

.wechat-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #6b7280;
  font-size: 12px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--wechat-500);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.wechat-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.wechat-icon-circle {
  padding: 10px;
  border-radius: 50%;
  background: rgba(7, 193, 96, 0.1);
  color: var(--wechat-500);
  display: flex;
}

.wechat-desc {
  font-size: 12px;
  color: #6b7280;
  text-align: center;
  line-height: 1.6;
  margin: 0;
  padding: 0 16px;
}

.wechat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 0;
  border: none;
  border-radius: var(--radius-btn);
  background: linear-gradient(135deg, var(--wechat-500), var(--wechat-600));
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--shadow-wechat-btn);
  transition: transform 0.1s ease;
}

.wechat-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.wechat-btn:disabled {
  background: var(--text-muted);
  box-shadow: none;
  cursor: not-allowed;
}

.wechat-hint {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Card Footer
   ═══════════════════════════════════════════════════════════════════════════ */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 14px 32px;
  border-top: 1px solid rgba(8, 145, 178, 0.08);
  background: rgba(240, 253, 255, 0.4);
}

.footer-link {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}

.footer-dot {
  color: #cbd5e1;
  font-size: 10px;
  margin: 0 8px;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Version
   ═══════════════════════════════════════════════════════════════════════════ */
.version-text {
  position: relative;
  z-index: 1;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  margin: 16px 0 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Form Transition (Vue <Transition>)
   ═══════════════════════════════════════════════════════════════════════════ */
.fade-slide-enter-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.fade-slide-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Responsive
   ═══════════════════════════════════════════════════════════════════════════ */
@media (max-width: 440px) {
  .login-card {
    max-width: none;
    margin: 0;
  }

  .card-header {
    padding: 24px 20px 16px;
  }

  .card-tabs {
    padding: 0 20px;
  }

  .work-mode-bar {
    padding: 0 20px 0;
  }

  .card-body {
    padding: 16px 20px 24px;
  }

  .card-footer {
    padding: 12px 20px;
  }

  .logo {
    width: 56px;
    height: 56px;
  }

  .title {
    font-size: 22px;
  }
}

@media (max-width: 360px) {
  .card-header {
    padding: 20px 16px 14px;
  }

  .card-tabs {
    padding: 0 16px;
  }

  .work-mode-bar {
    padding: 0 16px 0;
  }

  .card-body {
    padding: 14px 16px 20px;
  }

  .card-footer {
    padding: 10px 16px;
  }

  .tab-btn {
    font-size: 13px;
  }
}
</style>
