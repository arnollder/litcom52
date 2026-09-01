import { ref, computed } from 'vue'
import { useSavedCounterparty } from '../utils/counterparty.js'
import {
  fetchPushPublicKey,
  subscribePush,
  unsubscribePush,
} from '../services/push.js'

const subscribedEndpoint = ref('')

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

function subscriptionPayload(subscription) {
  const json = subscription.toJSON()
  return {
    endpoint: json.endpoint,
    keys: json.keys,
  }
}

export function usePushNotifications() {
  const savedCounterparty = useSavedCounterparty()
  const isSupported = computed(
    () =>
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
  )
  const isSubscribed = computed(() => Boolean(subscribedEndpoint.value))
  const isLoading = ref(false)
  const error = ref('')

  async function refreshSubscriptionState() {
    if (!isSupported.value) return
    const registration = await navigator.serviceWorker.ready
    const current = await registration.pushManager.getSubscription()
    subscribedEndpoint.value = current?.endpoint || ''
  }

  async function enableNotifications() {
    error.value = ''
    const counterparty = savedCounterparty.value
    if (!counterparty) {
      error.value = 'Сначала выберите и сохраните контрагента при оформлении заказа.'
      return false
    }

    if (!isSupported.value) {
      error.value = 'Браузер не поддерживает push-уведомления.'
      return false
    }

    isLoading.value = true
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        error.value = 'Разрешите уведомления в браузере.'
        return false
      }

      const publicKey = await fetchPushPublicKey()
      if (!publicKey) {
        error.value = 'Push на сервере пока не настроен.'
        return false
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }

      await subscribePush({
        counterpartyId: counterparty.id,
        counterpartyName: counterparty.name,
        subscription: subscriptionPayload(subscription),
      })

      subscribedEndpoint.value = subscription.endpoint
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Не удалось включить уведомления'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function disableNotifications() {
    error.value = ''
    if (!isSupported.value) return false

    isLoading.value = true
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await unsubscribePush({ endpoint: subscription.endpoint })
        await subscription.unsubscribe()
      }
      subscribedEndpoint.value = ''
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Не удалось отключить уведомления'
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    savedCounterparty,
    isSupported,
    isSubscribed,
    isLoading,
    error,
    refreshSubscriptionState,
    enableNotifications,
    disableNotifications,
  }
}
