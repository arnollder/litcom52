import { computed, ref } from 'vue'
import {
  fetchPushVapidPublicKey,
  subscribeAdminPush,
  unsubscribeAdminPush,
} from '../services/moysklad'

const PUSH_ENABLED_KEY = 'litcom52-admin-push-enabled'

const supported = ref(false)
const enabled = ref(false)
const permission = ref(typeof Notification !== 'undefined' ? Notification.permission : 'default')
const busy = ref(false)
const error = ref('')

function readEnabledFlag() {
  try {
    return localStorage.getItem(PUSH_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function writeEnabledFlag(value) {
  try {
    if (value) localStorage.setItem(PUSH_ENABLED_KEY, '1')
    else localStorage.removeItem(PUSH_ENABLED_KEY)
  } catch {
    // ignore
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.ready
}

export function useAdminPush() {
  supported.value =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  enabled.value = readEnabledFlag() && permission.value === 'granted'

  const canEnable = computed(
    () => supported.value && permission.value !== 'denied' && !enabled.value && !busy.value,
  )
  const canDisable = computed(() => supported.value && enabled.value && !busy.value)
  const canRetryDenied = computed(
    () => supported.value && permission.value === 'denied' && !busy.value,
  )

  async function enable() {
    if (!supported.value || busy.value) return false
    error.value = ''

    if (Notification.permission === 'denied') {
      permission.value = 'denied'
      error.value =
        'Уведомления запрещены в настройках сайта. Разрешите их для этого адреса и обновите страницу.'
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
          ? 'Браузер запретил уведомления. Разрешите их в настройках сайта и обновите страницу.'
          : 'Разрешение на уведомления не выдано'
      return false
    }

    busy.value = true
    try {
      const { publicKey } = await fetchPushVapidPublicKey()
      const registration = await getRegistration()
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

      await subscribeAdminPush(subscription.toJSON())
      writeEnabledFlag(true)
      enabled.value = true
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Не удалось включить уведомления'
      return false
    } finally {
      busy.value = false
    }
  }

  async function disable() {
    if (!supported.value || busy.value) return false
    busy.value = true
    error.value = ''

    try {
      const registration = await getRegistration()
      const subscription = await registration?.pushManager?.getSubscription()
      if (subscription) {
        await unsubscribeAdminPush(subscription.toJSON())
        await subscription.unsubscribe()
      }
      writeEnabledFlag(false)
      enabled.value = false
      if ('clearAppBadge' in navigator) await navigator.clearAppBadge()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Не удалось отключить уведомления'
      return false
    } finally {
      busy.value = false
    }
  }

  async function syncSubscription() {
    if (!supported.value) return
    if (Notification.permission !== 'granted') return
    if (!readEnabledFlag()) {
      const registration = await getRegistration()
      const existing = await registration?.pushManager?.getSubscription()
      if (!existing) return
    }
    await enable()
  }

  return {
    supported,
    enabled,
    permission,
    busy,
    error,
    canEnable,
    canDisable,
    canRetryDenied,
    enable,
    disable,
    syncSubscription,
  }
}

export function syncAppBadge(count) {
  if (typeof navigator === 'undefined') return
  const value = Number(count) || 0
  if (value > 0 && 'setAppBadge' in navigator) {
    navigator.setAppBadge(value).catch(() => {})
    return
  }
  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {})
  }
}
