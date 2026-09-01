<script setup>
import { computed, onMounted } from 'vue'
import { useSavedCounterparty } from '../utils/counterparty.js'
import { usePushNotifications } from '../composables/usePushNotifications'

const savedCounterparty = useSavedCounterparty()

const {
  isSupported,
  isSubscribed,
  isLoading,
  error,
  refreshSubscriptionState,
  enableNotifications,
  disableNotifications,
} = usePushNotifications()

const visible = computed(() => isSupported.value && Boolean(savedCounterparty.value))

const statusLabel = computed(() => (isSubscribed.value ? 'Вкл' : 'Выкл'))

const title = computed(() => {
  if (error.value) return error.value
  const name = savedCounterparty.value?.name
  if (!name) return 'Уведомления об отгрузке'
  if (isSubscribed.value) return `Push включён · ${name}`
  return `Push выключен · ${name}`
})

async function toggle() {
  if (isLoading.value) return
  if (isSubscribed.value) await disableNotifications()
  else await enableNotifications()
}

onMounted(() => {
  refreshSubscriptionState()
})
</script>

<template>
  <button
    v-if="visible"
    class="push-toggle"
    type="button"
    :class="isSubscribed ? 'push-toggle--on' : 'push-toggle--off'"
    :disabled="isLoading"
    :aria-label="title"
    :title="title"
    :aria-pressed="isSubscribed"
    @click="toggle"
  >
    <span class="push-toggle__icon-wrap" aria-hidden="true">
      <svg v-if="isSubscribed" class="push-toggle__icon" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Zm6.3-5.8V11a6.3 6.3 0 1 0-12.6 0v5.2L4.4 18v1.2h15.2V18l-1.3-1.8ZM12 2.8a4.9 4.9 0 0 1 4.9 4.9v5.6l.9 1.2H6.2l.9-1.2V7.7A4.9 4.9 0 0 1 12 2.8Z"
        />
      </svg>
      <svg v-else class="push-toggle__icon" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M5.64 4.22 4.22 5.64l2.1 2.1C5.1 8.84 4.4 9.86 4.4 11v5.2L3.1 17.4V18h2.1l1.3-1.8V11c0-.62.2-1.2.54-1.68l1.7 1.7V11a4.9 4.9 0 0 1 4.2-4.84l1.46 1.46A6.25 6.25 0 0 0 12 5.2c-1.2 0-2.3.35-3.24.96l1.42 1.42A4.85 4.85 0 0 1 12 7.7c2.5 0 4.5 2.02 4.5 4.5v5.6l.7.96H8.74l1.28 1.28H18.4l1.3 1.8h2.1v-.6l-1.3-1.8V11c0-1.14-.7-2.16-1.74-2.68l1.42-1.42c1.02.78 1.72 1.98 1.82 3.36l1.68-1.68c-.28-1.48-1.14-2.74-2.34-3.54l1.42-1.42ZM9.8 19.8h4.4a2.2 2.2 0 0 1-4.4 0Z"
        />
      </svg>
    </span>
    <span class="push-toggle__label">{{ statusLabel }}</span>
  </button>
</template>

<style scoped>
.push-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.6rem;
  padding: 0 0.7rem 0 0.55rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  cursor: pointer;
  flex-shrink: 0;
  font-family: var(--font-body);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.push-toggle--on {
  color: var(--on-green);
  border-color: var(--accent-border-strong);
  background: linear-gradient(145deg, var(--green-soft), var(--green));
  box-shadow: 0 0 0 1px var(--accent-border-faint);
}

.push-toggle--off {
  color: var(--ink-muted);
  border-color: var(--line);
  background: var(--inset-soft);
}

.push-toggle--off:hover:not(:disabled) {
  color: var(--ink);
  border-color: var(--btn-ghost-hover);
  background: var(--nav-hover);
}

.push-toggle--on:hover:not(:disabled) {
  filter: brightness(1.03);
}

.push-toggle:disabled {
  opacity: 0.6;
  cursor: wait;
}

.push-toggle__icon-wrap {
  display: grid;
  place-items: center;
  width: 1.15rem;
  height: 1.15rem;
}

.push-toggle__icon {
  width: 1.15rem;
  height: 1.15rem;
}

.push-toggle__label {
  line-height: 1;
}

@media (max-width: 420px) {
  .push-toggle {
    padding: 0 0.55rem;
    gap: 0.25rem;
  }

  .push-toggle__label {
    font-size: 0.72rem;
  }
}
</style>
