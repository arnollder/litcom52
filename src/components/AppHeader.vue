<script setup>
import { RouterLink, useRoute } from 'vue-router'
import { computed, ref } from 'vue'
import { useCartStore } from '../stores/cart'

const route = useRoute()
const cart = useCartStore()
const open = ref(false)

const links = [
  { to: '/', label: 'Главная' },
  { to: '/instructions', label: 'Инструкция' },
  { to: '/shop', label: 'Каталог' },
]

const cartLabel = computed(() =>
  cart.count ? `Корзина · ${cart.count}` : 'Корзина',
)

function close() {
  open.value = false
}
</script>

<template>
  <header class="header">
    <div class="container header__inner">
      <RouterLink class="brand" to="/" @click="close">
        <span class="brand__mark" aria-hidden="true">Л</span>
        <span class="brand__text">
          <strong>ЛИТКОМ</strong>
          <em>ЕКБ</em>
        </span>
      </RouterLink>

      <nav class="nav" :class="{ 'nav--open': open }" aria-label="Основная навигация">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="nav__link"
          :class="{ 'nav__link--active': route.path === link.to }"
          @click="close"
        >
          {{ link.label }}
        </RouterLink>
        <RouterLink class="btn btn-primary nav__cart" to="/checkout" @click="close">
          {{ cartLabel }}
        </RouterLink>
      </nav>

      <button
        class="menu-btn"
        type="button"
        :aria-expanded="open"
        aria-label="Меню"
        @click="open = !open"
      >
        <span /><span /><span />
      </button>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 50;
  height: var(--header-h);
  border-bottom: 1px solid transparent;
  background: rgba(5, 10, 7, 0.72);
  backdrop-filter: blur(16px);
}

.header__inner {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  color: var(--ink);
}

.brand__mark {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 700;
  color: #04120b;
  background: linear-gradient(145deg, var(--green-soft), var(--green-deep));
}

.brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.05;
}

.brand__text strong {
  font-family: var(--font-display);
  font-size: 0.95rem;
  letter-spacing: 0.04em;
}

.brand__text em {
  font-style: normal;
  font-size: 0.72rem;
  color: var(--green);
  letter-spacing: 0.18em;
}

.nav {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.nav__link {
  color: var(--ink-muted);
  text-decoration: none;
  padding: 0.55rem 0.85rem;
  border-radius: 999px;
  font-weight: 600;
  transition: color 0.2s ease, background 0.2s ease;
}

.nav__link:hover,
.nav__link--active {
  color: var(--ink);
  background: rgba(62, 207, 142, 0.08);
}

.nav__cart {
  margin-left: 0.4rem;
  padding: 0.7rem 1.1rem;
}

.menu-btn {
  display: none;
  width: 2.6rem;
  height: 2.6rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  padding: 0.55rem;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
}

.menu-btn span {
  display: block;
  height: 2px;
  background: var(--green);
  border-radius: 2px;
}

@media (max-width: 820px) {
  .menu-btn {
    display: flex;
  }

  .nav {
    position: absolute;
    inset: var(--header-h) 1rem auto;
    display: none;
    flex-direction: column;
    align-items: stretch;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: rgba(8, 16, 12, 0.98);
    box-shadow: var(--shadow);
  }

  .nav--open {
    display: flex;
    animation: rise 0.25s ease both;
  }

  .nav__cart {
    margin: 0.4rem 0 0;
  }
}
</style>
