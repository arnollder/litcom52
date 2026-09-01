import { computed, ref } from 'vue'
import { registerServiceWorker } from './usePwaInstall.js'
import { useSavedCounterparty } from '../utils/counterparty.js'
import {
  fetchPushPublicKey,
  subscribePush,
  unsubscribePush,
} from '../services/push.js'

const subscribedEndpoint = ref('')
const isLoading = ref(false)
const error = ref('')
const permission = ref(
  typeof Notification !== 'undefined' ? Notification.permission : 'default',
)

let registrationPromise = null

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

async function getServiceWorkerRegistration() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null
  if (!registrationPromise) {
    registrationPromise = (async () => {
      registerServiceWorker()
      const existing = await navigator.serviceWorker.getRegistration()
      if (existing) return existing
      try {
        return await navigator.serviceWorker.register('/sw.js')
      } catch {
        return navigator.serviceWorker.ready
      }
    })()
  }
  const registration = await registrationPromise
  return registration?.active ? registration : navigator.serviceWorker.ready
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

  async function refreshSubscriptionState() {
    if (!isSupported.value) return
    try {
      const registration = await getServiceWorkerRegistration()
      const current = await registration?.pushManager?.getSubscription()
      subscribedEndpoint.value = current?.endpoint || ''
      permission.value = Notification.permission
    } catch {
      subscribedEndpoint.value = ''
    }
  }

  async function enableNotifications() {
    error.value = ''
    const counterparty = savedCounterparty.value
    if (!counterparty) {
      error.value = 'Сначала оформите заказ и выберите контрагента.'
      return false
    }

    if (!isSupported.value) {
      error.value = 'Браузер не поддерживает push-уведомления.'
      return false
    }

    if (Notification.permission === 'denied') {
      permission.value = 'denied'
      error.value = 'Уведомления запрещены в настройках браузера для этого сайта.'
      return false
    }

    const nextPermission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission()
    permission.value = nextPermission
    if (nextPermission !== 'granted') {
      error.value =
        nextPermission === 'denied'
          ? 'Браузер запретил уведомления. Разрешите их в настройках сайта.'
          : 'Разрешение на уведомления не выдано.'
      return false
    }

    isLoading.value = true
    try {
      const publicKey = await fetchPushPublicKey()
      if (!publicKey) {
        error.value = 'Push на сервере пока не настроен.'
        return false
      }

      const registration = await getServiceWorkerRegistration()
      if (!registration?.pushManager) {
        throw new Error('Service Worker не готов')
      }

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
      const registration = await getServiceWorkerRegistration()
      const subscription = await registration?.pushManager?.getSubscription()
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
    permission,
    refreshSubscriptionState,
    enableNotifications,
    disableNotifications,
  }
}
