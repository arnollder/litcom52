<script setup>
import { onMounted } from 'vue'
import { usePushNotifications } from '../composables/usePushNotifications'

defineProps({
  variant: {
    type: String,
    default: 'panel',
    validator: (value) => ['panel', 'inline'].includes(value),
  },
})

const {
  savedCounterparty,
  isSupported,
  isSubscribed,
  isLoading,
  error,
  refreshSubscriptionState,
  enableNotifications,
  disableNotifications,
} = usePushNotifications()

onMounted(() => {
  refreshSubscriptionState()
})
</script>

<template>
  <div
    v-if="isSupported && savedCounterparty"
    class="push-notify"
    :class="`push-notify--${variant}`"
  >
    <template v-if="isSubscribed">
      <p class="push-notify__status">
        Уведомления включены для
        <strong>{{ savedCounterparty.name }}</strong>
        — сообщим, когда заказ отгружен.
      </p>
      <button
        class="btn btn-ghost"
        type="button"
        :disabled="isLoading"
        @click="disableNotifications"
      >
        Отключить
      </button>
    </template>
    <template v-else>
      <p class="muted push-notify__hint">
        Получайте push, когда заказ для
        <strong>{{ savedCounterparty.name }}</strong>
        будет отгружен.
      </p>
      <button
        class="btn btn-ghost"
        type="button"
        :disabled="isLoading"
        @click="enableNotifications"
      >
        {{ isLoading ? 'Подключаем…' : 'Включить уведомления' }}
      </button>
    </template>
    <p v-if="error" class="error push-notify__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.push-notify {
  display: grid;
  gap: 0.65rem;
}

.push-notify--panel {
  margin-top: 1.25rem;
  padding: 1rem 1.05rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--accent-fill-soft);
}

.push-notify__status,
.push-notify__hint {
  margin: 0;
  line-height: 1.45;
  font-size: 0.92rem;
}

.push-notify__error {
  margin: 0;
  font-size: 0.88rem;
}
</style>
