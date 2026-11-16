import { getCapacitorPlugin, isCapacitorNative } from '../utils/capacitor.js'

const FCM_TOKEN_KEY = 'litcom52-fcm-token'

let listenersAttached = false
/** @type {Array<(token: string) => void>} */
const tokenWaiters = []

export function isCapacitorPushAvailable() {
  if (!isCapacitorNative()) return false
  const Push = getCapacitorPlugin('PushNotifications')
  return Boolean(Push?.requestPermissions && Push?.register)
}

export function readStoredFcmToken() {
  try {
    return String(localStorage.getItem(FCM_TOKEN_KEY) || '').trim()
  } catch {
    return ''
  }
}

function writeStoredFcmToken(token) {
  try {
    if (token) localStorage.setItem(FCM_TOKEN_KEY, token)
    else localStorage.removeItem(FCM_TOKEN_KEY)
  } catch {
    // ignore
  }
}

function resolveTokenWaiters(token) {
  const list = tokenWaiters.splice(0, tokenWaiters.length)
  for (const resolve of list) resolve(token)
}

async function ensureListeners(Push) {
  if (listenersAttached) return
  listenersAttached = true

  Push.addListener('registration', (event) => {
    const token = String(event?.value || '').trim()
    if (!token) return
    writeStoredFcmToken(token)
    resolveTokenWaiters(token)
  })

  Push.addListener('registrationError', (err) => {
    console.error('[fcm] registrationError', err)
  })

  Push.addListener('pushNotificationActionPerformed', (action) => {
    const raw = action?.notification?.data?.url || action?.notification?.data?.link || ''
    const path = String(raw || '').trim()
    if (!path) return
    try {
      const target = new URL(path, window.location.origin)
      window.location.assign(`${target.pathname}${target.search}${target.hash}`)
    } catch {
      // ignore bad url
    }
  })
}

function waitForToken(timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const idx = tokenWaiters.indexOf(onToken)
      if (idx >= 0) tokenWaiters.splice(idx, 1)
      reject(new Error('Таймаут регистрации FCM. Проверьте google-services.json / Firebase.'))
    }, timeoutMs)

    function onToken(token) {
      window.clearTimeout(timer)
      resolve(token)
    }

    tokenWaiters.push(onToken)
  })
}

/**
 * Request permission, register for FCM, wait for device token.
 * Returns token string or throws.
 */
export async function registerCapacitorFcmToken({ timeoutMs = 20000 } = {}) {
  const Push = getCapacitorPlugin('PushNotifications')
  if (!Push?.requestPermissions || !Push?.register) {
    throw new Error(
      'Push в этом APK недоступен. Обнови приложение до последней версии (нужен FCM-плагин).',
    )
  }

  const perm = await Push.requestPermissions()
  const receive = String(perm?.receive || '').toLowerCase()
  if (receive !== 'granted') {
    throw new Error('Уведомления запрещены в настройках Android. Разрешите их для приложения.')
  }

  try {
    await Push.createChannel({
      id: 'litcom52_default',
      name: 'Литком М52',
      description: 'Заказы и статусы',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
    })
  } catch {
    // channel may already exist
  }

  await ensureListeners(Push)

  const pending = waitForToken(timeoutMs)
  await Push.register()

  const existing = readStoredFcmToken()
  if (existing) {
    try {
      return await Promise.race([
        pending,
        new Promise((resolve) => window.setTimeout(() => resolve(existing), 2500)),
      ])
    } catch {
      return existing
    }
  }

  return pending
}

export async function clearCapacitorFcmToken() {
  writeStoredFcmToken('')
}

export function fcmSubscriptionPayload(token) {
  const value = String(token || '').trim()
  return {
    channel: 'fcm',
    token: value,
    endpoint: `fcm:${value}`,
  }
}
