import { createRouter, createWebHashHistory } from 'vue-router'
import { useUserStore } from '../store/user'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('../views/Login.vue') },
    {
      path: '/home',
      component: () => import('../views/Home.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

/**
 * 路由守卫：登录态以主进程会话为权威
 * localStorage token 可能残留/过期，进入受保护页面前必须校验主进程 session:check
 */
router.beforeEach(async (to, _from, next) => {
  const userStore = useUserStore()

  // 主进程会话校验（权威）
  let mainLoggedIn = false
  try {
    const result = await window.api.checkSession()
    mainLoggedIn = result.success && result.data?.loggedIn === true
  } catch {
    mainLoggedIn = false
  }

  if (to.meta.requiresAuth && !mainLoggedIn) {
    // 主进程未登录：清除本地残留登录态（token 可能过期/伪造），回登录页
    userStore.logout()
    next({ path: '/' })
    return
  }
  if (to.path === '/' && mainLoggedIn) {
    next({ path: '/home' })
    return
  }
  next()
})

export default router
