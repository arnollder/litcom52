import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import InstructionsView from '../views/InstructionsView.vue'
import ShopView from '../views/ShopView.vue'
import CheckoutView from '../views/CheckoutView.vue'
import AdminView from '../views/AdminView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Литком ЕКБ' } },
    {
      path: '/instructions',
      name: 'instructions',
      component: InstructionsView,
      meta: { title: 'Инструкция — Литком ЕКБ' },
    },
    {
      path: '/shop',
      name: 'shop',
      component: ShopView,
      meta: { title: 'Каталог — Литком ЕКБ' },
    },
    {
      path: '/checkout',
      name: 'checkout',
      component: CheckoutView,
      meta: { title: 'Оформление — Литком ЕКБ' },
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      meta: { title: 'Админка — Литком ЕКБ', hideChrome: true },
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  document.title = to.meta.title || 'Литком ЕКБ'
})

export default router
