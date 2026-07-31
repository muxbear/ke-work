import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface AuthResult {
  token: string
  refreshToken: string
  user: { id: string; username: string; mobile?: string }
}

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('user_token') || '')
  const refreshToken = ref(localStorage.getItem('user_refresh_token') || '')
  const userInfo = ref<{ id?: string; username?: string; mobile?: string }>({})

  const isLoggedIn = computed(() => Boolean(token.value))

  function setLogin(result: AuthResult): void {
    token.value = result.token
    refreshToken.value = result.refreshToken
    userInfo.value = result.user
    localStorage.setItem('user_token', result.token)
    localStorage.setItem('user_refresh_token', result.refreshToken)
    localStorage.setItem('user_info', JSON.stringify(result.user))
  }

  function restoreUserInfo(): void {
    const saved = localStorage.getItem('user_info')
    if (saved) {
      try {
        userInfo.value = JSON.parse(saved)
      } catch {
        userInfo.value = {}
      }
    }
  }

  function logout(): void {
    token.value = ''
    refreshToken.value = ''
    userInfo.value = {}
    localStorage.removeItem('user_token')
    localStorage.removeItem('user_refresh_token')
    localStorage.removeItem('user_info')
  }

  restoreUserInfo()

  return { token, refreshToken, userInfo, isLoggedIn, setLogin, logout }
})
