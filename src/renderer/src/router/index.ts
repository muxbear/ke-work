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

router.beforeEach((to, _from, next) => {
  const userStore = useUserStore()
  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    next({ path: '/' })
    return
  }
  if (to.path === '/' && userStore.isLoggedIn) {
    next({ path: '/home' })
    return
  }
  next()
})

export default router
