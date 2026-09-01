<script setup>
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { computed } from 'vue'
import { useCartStore } from './stores/cart'
import { useAppendToOrder } from './composables/useAppendToOrder.js'
import { useOrderEditSession } from './utils/order-edit-session.js'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import CartToast from './components/CartToast.vue'

const cart = useCartStore()
const route = useRoute()
const { isAppendMode, session } = useOrderEditSession()
const { isAppending, appendError, appendCartToOrder } = useAppendToOrder()
const hideChrome = computed(() => Boolean(route.meta.hideChrome))
const showFooterCart = computed(() => route.name === 'shop' && cart.count > 0)

const footerLabel = computed(() => {
  if (!isAppendMode.value) return 'В заказе'
  const name = session.value?.orderName
  return name ? `Дополнение №${name}` : 'Дополнение заказа'
})
</script>

<template>
  <AppHeader v-if="!hideChrome" />
  <main class="page-shell" :class="{ 'page-shell--admin': hideChrome }">
    <RouterView />
  </main>
  <AppFooter v-if="!hideChrome" />
  <CartToast v-if="!hideChrome" />

  <div v-if="showFooterCart" class="sticky-cart">
    <div class="sticky-cart__inner container">
      <div>
        <div class="sticky-cart__label">{{ footerLabel }}</div>
        <div class="sticky-cart__value">
          {{ cart.count }} поз. · {{ cart.total.toLocaleString('ru-RU') }} ₽
        </div>
        <p v-if="appendError" class="sticky-cart__error">{{ appendError }}</p>
      </div>
      <div class="sticky-cart__actions">
        <button class="btn btn-ghost" type="button" @click="cart.clear()">Очистить</button>
        <button
          v-if="isAppendMode"
          type="button"
          class="btn btn-primary"
          :disabled="isAppending"
          @click="appendCartToOrder"
        >
          {{ isAppending ? 'Сохранение…' : 'Добавить к заказу' }}
        </button>
        <RouterLink v-else class="btn btn-primary" to="/checkout">Оформить</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-shell--admin {
  padding-bottom: 2rem;
}

.sticky-cart {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  padding: 0.85rem 0 calc(0.85rem + env(safe-area-inset-bottom));
  background: var(--sticky-bg);
  border-top: 1px solid var(--line);
  backdrop-filter: blur(14px);
}

.sticky-cart__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.sticky-cart__label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-muted);
}

.sticky-cart__value {
  font-family: var(--font-display);
  font-size: 1.05rem;
}

.sticky-cart__actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.sticky-cart__error {
  margin: 0.35rem 0 0;
  color: var(--danger-text);
  font-size: 0.82rem;
}

@media (max-width: 640px) {
  .sticky-cart__inner {
    flex-direction: column;
    align-items: stretch;
  }

  .sticky-cart__actions .btn {
    flex: 1;
  }
}
</style>
