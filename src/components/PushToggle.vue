<script setup>
import { computed, onMounted } from 'vue'
import { useAdminPush } from '../composables/useAdminPush.js'
import { usePushNotifications } from '../composables/usePushNotifications.js'
import { useSavedCounterparty } from '../utils/counterparty.js'

const props = defineProps({
  audience: {
    type: String,
    default: 'customer',
    validator: (value) => ['customer', 'admin'].includes(value),
  },
})

const savedCounterparty = useSavedCounterparty()
const customerPush = usePushNotifications()
const adminPush = useAdminPush()

const isAdmin = computed(() => props.audience === 'admin')

const visible = computed(() => {
  if (isAdmin.value) return adminPush.supported.value
  return customerPush.isSupported.value && Boolean(savedCounterparty.value?.token)
})

const isOn = computed(() =>
  isAdmin.value ? adminPush.enabled.value : customerPush.isSubscribed.value,
)

const isLoading = computed(() =>
  isAdmin.value ? adminPush.busy.value : customerPush.isLoading.value,
)

const error = computed(() => (isAdmin.value ? adminPush.error.value : customerPush.error.value))

const permission = computed(() =>
  isAdmin.value ? adminPush.permission.value : customerPush.permission.value,
)

const canToggle = computed(() => {
  if (isAdmin.value) {
    return (
      adminPush.canEnable.value || adminPush.canDisable.value || adminPush.canRetryDenied.value
    )
  }
  return (
    customerPush.canEnable.value ||
    customerPush.canDisable.value ||
    customerPush.canRetryDenied.value
  )
})

const statusLabel = computed(() => (isOn.value ? 'Вкл' : 'Выкл'))

const title = computed(() => {
  if (error.value) return error.value
  if (isAdmin.value) {
    if (isOn.value) return 'Уведомления о новых заказах включены'
    if (permission.value === 'denied') {
      return 'Разрешите уведомления в настройках сайта и обновите страницу'
    }
    return 'Включить уведомления о новых заказах'
  }
  const name = savedCounterparty.value?.name
  if (isOn.value) return `Push включён · ${name}`
  if (permission.value === 'denied') {
    return 'Разрешите уведомления в настройках сайта и обновите страницу'
  }
  return `Push выключен · ${name || 'контрагент'}`
})

async function toggle() {
  if (isLoading.value || !canToggle.value) return
  if (isAdmin.value) {
    if (adminPush.enabled.value) await adminPush.disable()
    else await adminPush.enable()
    return
  }
  if (customerPush.isSubscribed.value) await customerPush.disableNotifications()
  else await customerPush.enableNotifications()
}

onMounted(() => {
  if (!isAdmin.value) customerPush.refreshSubscriptionState()
})
</script>

<template>
  <div v-if="visible" class="push-toggle-wrap">
    <button
      class="push-toggle"
      type="button"
      :class="isOn ? 'push-toggle--on' : 'push-toggle--off'"
      :disabled="isLoading || !canToggle"
      :aria-label="title"
      :title="title"
      :aria-pressed="isOn"
      @click="toggle"
    >
      <span class="push-toggle__icon-wrap" aria-hidden="true">
        <svg
          v-if="isOn"
          class="push-toggle__icon"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6.2 10.2a5.8 5.8 0 0 1 11.6 0c0 3.4.9 5 1.7 6.1H4.5c.8-1.1 1.7-2.7 1.7-6.1Z"
          />
          <path
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.2 18.6a1.9 1.9 0 0 0 3.6 0"
          />
        </svg>
        <svg
          v-else
          class="push-toggle__icon"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6.2 10.2a5.8 5.8 0 0 1 11.6 0c0 3.4.9 5 1.7 6.1H4.5c.8-1.1 1.7-2.7 1.7-6.1Z"
          />
          <path
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.2 18.6a1.9 1.9 0 0 0 3.6 0"
          />
          <path
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            d="M4.2 4.2 19.8 19.8"
          />
        </svg>
      </span>
      <span class="push-toggle__label">{{ statusLabel }}</span>
    </button>
    <p v-if="error" class="push-toggle__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.push-toggle-wrap {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
}

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

.push-toggle__error {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  z-index: 60;
  margin: 0;
  width: max-content;
  max-width: min(18rem, 70vw);
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-strong);
  color: var(--danger-text);
  font-size: 0.75rem;
  line-height: 1.35;
  box-shadow: var(--shadow);
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
