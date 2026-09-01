import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ShopView from '../views/ShopView.vue'
import CheckoutView from '../views/CheckoutView.vue'
import OrdersView from '../views/OrdersView.vue'
import AdminView from '../views/AdminView.vue'
import { adminOrigin, isAdminHost, isStoreHost } from '../utils/hosts'

const adminMeta = { title: 'Админка М52', hideChrome: true }

const adminHostRoutes = [
  { path: '/', name: 'admin', component: AdminView, meta: adminMeta },
  { path: '/admin', redirect: '/' },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const storeHostRoutes = [
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
    path: '/orders',
    name: 'orders',
    component: OrdersView,
    meta: { title: 'Мои заказы — Литком-М52' },
  },
  // Local/dev: keep /admin. Production store host redirects away in beforeEach.
  { path: '/admin', name: 'admin', component: AdminView, meta: adminMeta },
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

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title || 'Литком-М52'
})

export default router
