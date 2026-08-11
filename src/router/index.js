import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ShopView from '../views/ShopView.vue'
import CheckoutView from '../views/CheckoutView.vue'
import AdminView from '../views/AdminView.vue'
import { adminOrigin, isAdminHost, isStoreHost } from '../utils/hosts'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Литком-М52' } },
    {
      path: '/shop',
      name: 'shop',
      component: ShopView,
      meta: { title: 'Каталог — Литком-М52' },
    },
    {
      path: '/checkout',
      name: 'checkout',
      component: CheckoutView,
      meta: { title: 'Оформление — Литком-М52' },
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      meta: { title: 'Админка М52', hideChrome: true },
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  if (typeof window === 'undefined') return true

  if (isAdminHost() && to.name !== 'admin') {
    return { name: 'admin' }
  }

  if (isStoreHost() && to.name === 'admin') {
    window.location.replace(`${adminOrigin()}/admin`)
    return false
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title || 'Литком-М52'
})

export default router
