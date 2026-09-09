import { createRouter, createWebHistory } from 'vue-router'
import { adminOrigin, isAdminHost, isStoreHost } from '../utils/hosts'
import { readOrderEditSession } from '../utils/order-edit-session.js'

const adminMeta = { title: 'Админка М52', hideChrome: true }

const adminHostRoutes = [
  {
    path: '/',
    name: 'admin',
    component: () => import('../views/AdminView.vue'),
    meta: adminMeta,
  },
  { path: '/admin', redirect: '/' },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const storeHostRoutes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { title: 'Литком-М52' },
  },
  {
    path: '/shop',
    name: 'shop',
    component: () => import('../views/ShopView.vue'),
    meta: { title: 'Каталог — Литком-М52' },
  },
  {
    path: '/checkout',
    name: 'checkout',
    component: () => import('../views/CheckoutView.vue'),
    meta: { title: 'Оформление — Литком-М52' },
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('../views/OrdersView.vue'),
    meta: { title: 'Мои заказы — Литком-М52' },
  },
  // Local/dev: keep /admin. Production store host redirects away in beforeEach.
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminView.vue'),
    meta: adminMeta,
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: isAdminHost() ? adminHostRoutes : storeHostRoutes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  if (typeof window === 'undefined') return true

  if (isStoreHost() && (to.name === 'admin' || to.path === '/admin' || to.path.startsWith('/admin/'))) {
    window.location.replace(`${adminOrigin()}/`)
    return false
  }

  if (to.name === 'checkout' && readOrderEditSession()) {
    return { name: 'shop' }
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title || 'Литком-М52'
})

export default router
