/**
 * Mobile shell: resolve current web URL from remote config, then leave
 * the local Capacitor origin for the live storefront (1:1 with the website).
 *
 * Domain moves only require updating app-config.json — users keep the same APK.
 *
 * Updates: config.apkVersionCode + apkUrl vs local App.getInfo().build —
 * shown on splash before redirect (после ухода на сайт Capacitor JS уже нет).
 *
 * Hidden admin: 7 taps on the mark → ADMIN_TOKEN → /admin#admin_token=…
 *
 * No bundler for mobile/www — use window.Capacitor.Plugins (injected by native).
 */

const CONFIG_URLS = [
  'https://arnolder.ru/litcom-app-config.json',
  'https://litkom-m52.arnolder.ru/app-config.json',
]

const FALLBACK_WEB_URL = 'https://litkom-m52.arnolder.ru/'
const CACHE_KEY = 'litcom52.mobile.webUrl'
const ADMIN_MODE_KEY = 'litcom52.adminMode'
const ADMIN_TOKEN_KEY = 'litcom52.adminToken'
const ADMIN_TAP_TARGET = 7
const ADMIN_TAP_WINDOW_MS = 3000
/** Keep HTML splash visible long enough to start the 7-tap admin sequence. */
const MIN_SPLASH_MS = 3000

const bootStartedAt = Date.now()

const statusEl = document.getElementById('status')
const retryBtn = document.getElementById('retry')
const markEl = document.getElementById('mark')
const bootCopyEl = document.getElementById('boot-copy')
const adminGate = document.getElementById('admin-gate')
const adminTokenInput = document.getElementById('admin-token')
const adminErrorEl = document.getElementById('admin-error')
const adminCancelBtn = document.getElementById('admin-cancel')
const updateGate = document.getElementById('update-gate')
const updateDetail = document.getElementById('update-detail')
const updateNowBtn = document.getElementById('update-now')
const updateLaterBtn = document.getElementById('update-later')
const localVersionEl = document.getElementById('local-version')

let bootAborted = false
let adminMode = false
let updateMode = false
let tapCount = 0
let tapTimer = 0
let resolvedWebUrl = ''
let pendingApkUrl = ''
let localBuild = 1
let localVersionName = '1.0'
let cachedConfig = null

function capacitorPlugin(name) {
  try {
    return window.Capacitor?.Plugins?.[name] || null
  } catch {
    return null
  }
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text
}

function setAdminError(text) {
  if (!adminErrorEl) return
  if (text) {
    adminErrorEl.textContent = text
    adminErrorEl.classList.add('show')
  } else {
    adminErrorEl.textContent = ''
    adminErrorEl.classList.remove('show')
  }
}

function normalizeWebUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

function normalizeHttpsUrl(value) {
  return normalizeWebUrl(value)
}

function readCachedUrl() {
  try {
    return normalizeWebUrl(localStorage.getItem(CACHE_KEY))
  } catch {
    return ''
  }
}

function writeCachedUrl(url) {
  try {
    localStorage.setItem(CACHE_KEY, url)
  } catch {
    // ignore quota / private mode
  }
}

async function fetchConfig(url) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8000)
  try {
    // Bust WebView disk cache (litkom used to serve app-config as immutable).
    const bust = new URL(url)
    bust.searchParams.set('_', String(Date.now()))
    const response = await fetch(bust.toString(), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    window.clearTimeout(timer)
  }
}

async function readLocalAppInfo() {
  const App = capacitorPlugin('App')
  try {
    if (App?.getInfo) {
      const info = await App.getInfo()
      localVersionName = String(info.version || '1.0')
      localBuild = Number.parseInt(String(info.build || '1'), 10) || 1
    }
  } catch {
    localVersionName = '1.0'
    localBuild = 1
  }
  if (localVersionEl) {
    localVersionEl.textContent = `v${localVersionName} (${localBuild})`
  }
}

async function resolveConfig() {
  for (const configUrl of CONFIG_URLS) {
    try {
      setStatus(`Конфиг: ${new URL(configUrl).host}`)
      const config = await fetchConfig(configUrl)
      const webUrl = normalizeWebUrl(config?.webUrl || config?.apiBase)
      if (webUrl) {
        writeCachedUrl(webUrl)
        cachedConfig = { ...config, webUrl }
        return cachedConfig
      }
    } catch {
      // try next source
    }
  }

  const cached = readCachedUrl()
  cachedConfig = {
    webUrl: cached || FALLBACK_WEB_URL,
  }
  return cachedConfig
}

function getUpdateOffer(config) {
  const remoteCode = Number.parseInt(String(config?.apkVersionCode ?? ''), 10)
  const apkUrl = normalizeHttpsUrl(config?.apkUrl)
  if (!Number.isFinite(remoteCode) || remoteCode <= localBuild || !apkUrl) {
    return null
  }
  const remoteName = String(config?.apkVersionName || remoteCode).trim() || String(remoteCode)
  return { remoteCode, remoteName, apkUrl }
}

function buildAdminUrl(webUrl, token) {
  const target = new URL('/admin', webUrl)
  target.hash = `admin_token=${encodeURIComponent(token)}`
  return target.toString()
}

async function prefsGet(key) {
  const Preferences = capacitorPlugin('Preferences')
  if (!Preferences?.get) return ''
  try {
    const result = await Preferences.get({ key })
    return String(result?.value || '').trim()
  } catch {
    return ''
  }
}

async function prefsSet(key, value) {
  const Preferences = capacitorPlugin('Preferences')
  if (!Preferences?.set) return
  try {
    await Preferences.set({ key, value: String(value || '') })
  } catch {
    // ignore
  }
}

async function prefsRemove(key) {
  const Preferences = capacitorPlugin('Preferences')
  if (!Preferences?.remove) return
  try {
    await Preferences.remove({ key })
  } catch {
    // ignore
  }
}

async function saveAdminSession(token) {
  await prefsSet(ADMIN_MODE_KEY, '1')
  await prefsSet(ADMIN_TOKEN_KEY, token)
}

async function clearAdminSession() {
  await prefsRemove(ADMIN_MODE_KEY)
  await prefsRemove(ADMIN_TOKEN_KEY)
}

async function readAdminSession() {
  const mode = await prefsGet(ADMIN_MODE_KEY)
  const token = await prefsGet(ADMIN_TOKEN_KEY)
  return { mode: mode === '1', token }
}

function showUpdateGate(offer) {
  bootAborted = true
  updateMode = true
  pendingApkUrl = offer.apkUrl
  bootCopyEl?.classList.add('hidden')
  if (updateDetail) {
    updateDetail.textContent = `Сейчас v${localVersionName} (${localBuild}) → v${offer.remoteName} (${offer.remoteCode})`
  }
  updateGate?.classList.add('show')
  setStatus('Нужно обновить приложение')
}

function hideUpdateGate() {
  updateMode = false
  pendingApkUrl = ''
  updateGate?.classList.remove('show')
  bootCopyEl?.classList.remove('hidden')
}

async function showAdminGate() {
  bootAborted = true
  adminMode = true
  hideUpdateGate()
  bootCopyEl?.classList.add('hidden')
  statusEl?.classList.add('hidden')
  retryBtn?.classList.remove('show')
  retryBtn?.classList.add('hidden')
  adminGate?.classList.add('show')
  setAdminError('')
  const session = await readAdminSession()
  if (adminTokenInput && session.token) adminTokenInput.value = session.token
  window.setTimeout(() => adminTokenInput?.focus(), 50)
}

async function hideAdminGate() {
  // «Отмена» = уйти в витрину и забыть админ-сессию на этом устройстве.
  await clearAdminSession()
  adminMode = false
  adminGate?.classList.remove('show')
  bootCopyEl?.classList.remove('hidden')
  statusEl?.classList.remove('hidden')
  retryBtn?.classList.remove('hidden')
  if (adminTokenInput) adminTokenInput.value = ''
  setAdminError('')
  openService({ skipAdminSession: true })
}

async function openAdmin() {
  const token = String(adminTokenInput?.value || '').trim()
  if (!token) {
    setAdminError('Введите токен администратора')
    return
  }

  setAdminError('')
  setStatus('Открываю админку…')
  try {
    const webUrl =
      resolvedWebUrl ||
      cachedConfig?.webUrl ||
      (await resolveConfig()).webUrl
    resolvedWebUrl = webUrl
    await saveAdminSession(token)
    window.location.replace(buildAdminUrl(webUrl, token))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка'
    setAdminError(`Не удалось открыть админку: ${message}`)
  }
}

async function startUpdateDownload() {
  if (!pendingApkUrl) return
  setStatus('Открываю загрузку APK…')
  const Browser = capacitorPlugin('Browser')
  try {
    if (Browser?.open) {
      await Browser.open({ url: pendingApkUrl })
      return
    }
  } catch {
    // fall through
  }
  window.location.href = pendingApkUrl
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitMinSplash() {
  const left = MIN_SPLASH_MS - (Date.now() - bootStartedAt)
  if (left > 0) await sleep(left)
}

async function openService({ skipUpdateCheck = false, skipAdminSession = false } = {}) {
  if (adminMode) return

  bootAborted = false
  updateMode = false
  hideUpdateGate()
  retryBtn?.classList.remove('show')
  setStatus('Проверяю актуальный адрес')
  try {
    const config = await resolveConfig()
    const webUrl = config.webUrl
    if (bootAborted || adminMode) {
      resolvedWebUrl = webUrl
      return
    }
    resolvedWebUrl = webUrl

    if (!skipUpdateCheck) {
      const offer = getUpdateOffer(config)
      if (offer) {
        showUpdateGate(offer)
        return
      }
    }

    // Config is fast — without a floor the green «Л» flash is ~200ms and untappable.
    setStatus('Коснись логотипа для админки…')
    await waitMinSplash()
    if (bootAborted || adminMode || updateMode) return

    if (!skipAdminSession) {
      const session = await readAdminSession()
      if (session.mode && session.token) {
        setStatus('Открываю админку…')
        window.location.replace(buildAdminUrl(webUrl, session.token))
        return
      }
    }

    setStatus('Открываю сервис…')
    window.location.replace(webUrl)
  } catch (error) {
    if (bootAborted || adminMode || updateMode) return
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка'
    setStatus(`Не удалось открыть сервис: ${message}`)
    retryBtn?.classList.add('show')
  }
}

function onMarkTap() {
  // Первый тап сразу стопает уход на витрину — иначе не успеешь добить серию.
  bootAborted = true
  window.clearTimeout(tapTimer)
  tapCount += 1

  if (tapCount >= ADMIN_TAP_TARGET) {
    tapCount = 0
    showAdminGate()
    return
  }

  setStatus(`Админ-вход: ${tapCount}/${ADMIN_TAP_TARGET}`)
  tapTimer = window.setTimeout(() => {
    tapCount = 0
    if (adminMode || updateMode) return
    openService()
  }, ADMIN_TAP_WINDOW_MS)
}

markEl?.addEventListener('click', onMarkTap)

retryBtn?.addEventListener('click', () => {
  openService()
})

adminGate?.addEventListener('submit', (event) => {
  event.preventDefault()
  openAdmin()
})

adminCancelBtn?.addEventListener('click', () => {
  hideAdminGate()
})

updateNowBtn?.addEventListener('click', () => {
  startUpdateDownload()
})

updateLaterBtn?.addEventListener('click', () => {
  hideUpdateGate()
  openService({ skipUpdateCheck: true })
})

async function consumeClearAdminFlag() {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('clearAdmin') !== '1') return false
    await clearAdminSession()
    url.searchParams.delete('clearAdmin')
    const next = `${url.pathname}${url.search}${url.hash}` || '/'
    window.history.replaceState(null, '', next)
    return true
  } catch {
    return false
  }
}

readLocalAppInfo()
  .then(() => consumeClearAdminFlag())
  .then((cleared) => openService({ skipAdminSession: cleared }))
