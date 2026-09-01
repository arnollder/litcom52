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

const title = computed(() => {
  if (error.value) return error.value
  const name = savedCounterparty.value?.name
  if (!name) return 'Уведомления об отгрузке'
  if (isSubscribed.value) return `Push включён · ${name}`
  return `Включить push об отгрузке · ${name}`
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
    :class="{ 'push-toggle--on': isSubscribed }"
    :disabled="isLoading"
    :aria-label="title"
    :title="title"
    :aria-pressed="isSubscribed"
    @click="toggle"
  >
    <svg class="push-toggle__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Zm6.3-5.8V11a6.3 6.3 0 1 0-12.6 0v5.2L4.4 18v1.2h15.2V18l-1.3-1.8ZM12 2.8a4.9 4.9 0 0 1 4.9 4.9v5.6l.9 1.2H6.2l.9-1.2V7.7A4.9 4.9 0 0 1 12 2.8Z"
      />
    </svg>
  </button>
</template>

<style scoped>
.push-toggle {
  width: 2.6rem;
  height: 2.6rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.push-toggle:hover:not(:disabled) {
  background: var(--nav-hover);
  border-color: var(--btn-ghost-hover);
  color: var(--ink);
}

.push-toggle--on {
  color: var(--green);
  border-color: var(--accent-border);
  background: var(--accent-fill-soft);
  box-shadow: 0 0 0 1px var(--accent-border-faint);
}

.push-toggle:disabled {
  opacity: 0.55;
  cursor: wait;
}

.push-toggle__icon {
  width: 1.15rem;
  height: 1.15rem;
}
</style>
