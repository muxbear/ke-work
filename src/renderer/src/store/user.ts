import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('user_token') || '')
  const userInfo = ref<{ id?: string; name?: string; mobile?: string }>({})

  const isLoggedIn = computed(() => Boolean(token.value))

  function setToken(value: string) {
    token.value = value
    localStorage.setItem('user_token', value)
  }

  function setUserInfo(info: { id?: string; name?: string; mobile?: string }) {
    userInfo.value = info
    localStorage.setItem('user_info', JSON.stringify(info))
  }

  function restoreUserInfo() {
    const saved = localStorage.getItem('user_info')
    if (saved) {
      try {
        userInfo.value = JSON.parse(saved)
      } catch {
        userInfo.value = {}
      }
    }
  }

  function logout() {
    token.value = ''
    userInfo.value = {}
    localStorage.removeItem('user_token')
    localStorage.removeItem('user_info')
  }

  restoreUserInfo()

  return {
    token,
    userInfo,
    isLoggedIn,
    setToken,
    setUserInfo,
    logout
  }
})
