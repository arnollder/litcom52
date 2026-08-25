<script setup>
import { RouterLink, useRoute } from 'vue-router'
import { computed, ref } from 'vue'
import { useCartStore } from '../stores/cart'
import ThemeToggle from './ThemeToggle.vue'
import InstallAppButton from './InstallAppButton.vue'

const route = useRoute()
const cart = useCartStore()
const open = ref(false)

const links = [
  { to: '/', label: 'Главная' },
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
          <em>М52</em>
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

      <div class="header__actions">
        <InstallAppButton variant="header" />
        <ThemeToggle />

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
  background: var(--header-bg);
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
  color: var(--on-green);
  background: linear-gradient(145deg, var(--brand-mark-from), var(--brand-mark-to));
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
  margin-left: auto;
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
  background: var(--nav-hover);
}

.nav__cart {
  margin-left: 0.4rem;
  padding: 0.7rem 1.1rem;
}

.header__actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.menu-btn {
  display: none;
  width: 2.6rem;
  height: 2.6rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--green);
  cursor: pointer;
  padding: 0.55rem;
  flex-direction: column;
  justify-content: space-between;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.menu-btn:hover {
  background: var(--nav-hover);
  border-color: var(--btn-ghost-hover);
}

.menu-btn span {
  display: block;
  width: 100%;
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
    margin: 0;
    display: none;
    flex-direction: column;
    align-items: stretch;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: var(--surface-strong);
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
