<script setup>
import { useCartStore } from '../stores/cart'

const cart = useCartStore()
</script>

<template>
  <Transition name="toast">
    <div v-if="cart.toast" class="toast" role="status">
      <pre>{{ cart.toast }}</pre>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  right: 1rem;
  bottom: 5.5rem;
  z-index: 60;
  max-width: min(420px, calc(100vw - 2rem));
  padding: 1rem 1.1rem;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: #0d1a14;
  box-shadow: var(--shadow);
}

.toast pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: var(--font-body);
  font-size: 0.92rem;
  line-height: 1.45;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.28s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
