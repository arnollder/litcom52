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
  permission,
  canEnable,
  canDisable,
  canRetryDenied,
  refreshSubscriptionState,
  enableNotifications,
  disableNotifications,
} = usePushNotifications()

const visible = computed(() => isSupported.value && Boolean(savedCounterparty.value))

const buttonLabel = computed(() => {
  if (isSubscribed.value) return 'Push: вкл'
  if (permission.value === 'denied') return 'Push: запрещён'
  return 'Push: выкл'
})

const title = computed(() => {
  if (error.value) return error.value
  const name = savedCounterparty.value?.name
  if (isSubscribed.value) return `Уведомления включены · ${name}`
  if (permission.value === 'denied') {
    return 'Разрешите уведомления в настройках сайта и обновите страницу'
  }
  return `Уведомления об отгрузке · ${name || 'контрагент'}`
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
  <div v-if="visible" class="push-wrap">
    <button
      type="button"
      class="btn btn-ghost push-btn"
      :disabled="isLoading || (!canEnable && !canDisable && !canRetryDenied)"
      :title="title"
      :aria-label="title"
      @click="toggle"
    >
      {{ buttonLabel }}
    </button>
    <p v-if="error" class="push-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.push-wrap {
  display: grid;
  gap: 0.35rem;
  justify-items: end;
}

.push-btn {
  font-size: 0.82rem;
  padding: 0.35rem 0.65rem;
  white-space: nowrap;
}

.push-error {
  color: var(--danger-text);
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.35;
  max-width: min(16rem, 42vw);
  text-align: right;
}

@media (max-width: 820px) {
  .push-error {
    display: none;
  }
}
</style>
