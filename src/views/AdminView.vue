<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  clearAdminToken,
  fetchAdminOrders,
  getAdminToken,
  persistAdminToken,
  setAdminToken,
  updateAdminOrderStatus,
} from '../services/moysklad'
import AdminOrders from '../components/AdminOrders.vue'
import AdminPurchases from '../components/AdminPurchases.vue'
import AdminReports from '../components/AdminReports.vue'
import InstallAppButton from '../components/InstallAppButton.vue'
import PushToggle from '../components/PushToggle.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { syncAppBadge, useAdminPush } from '../composables/useAdminPush.js'

const POLL_MS = 45_000

const tokenInput = ref('')
const isAuthed = ref(Boolean(getAdminToken()))
const orders = ref([])
const newCount = ref(0)
const isLoading = ref(false)
const isUpdating = ref('')
const error = ref('')
const lastSyncedAt = ref(null)
const soundEnabled = ref(true)
const filter = ref('all')
const activeSection = ref('orders')
const knownIds = ref(new Set())
const flashIds = ref(new Set())

let pollTimer = null
let audioCtx = null
let ordersInFlight = false

const {
  syncSubscription: syncPushSubscription,
} = useAdminPush()

const SECTIONS = [
  { key: 'orders', label: 'Заказы' },
  { key: 'purchases', label: 'Закупки' },
  { key: 'reports', label: 'Отчёты' },
]

const filteredOrders = computed(() => {
  if (filter.value === 'all') return orders.value
  return orders.value.filter((order) => order.status === filter.value)
})

function setSection(section) {
  if (activeSection.value === section) return
  activeSection.value = section
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function playChime() {
  if (!soundEnabled.value || typeof window === 'undefined') return
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    audioCtx = audioCtx || new Ctx()
    const now = audioCtx.currentTime
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start(now)
    osc.stop(now + 0.3)
  } catch {
    // ignore audio errors
  }
}

async function loadOrders({ silent = false } = {}) {
  if (!isAuthed.value) return
  // Poll ticks must not pile up: MoySklad calls are serialized process-wide.
  if (ordersInFlight) return
  ordersInFlight = true
  if (!silent) isLoading.value = true
  error.value = ''

  try {
    const result = await fetchAdminOrders()
    const incoming = result.orders
    const nextIds = new Set(incoming.map((order) => order.id))
    const brandNew = incoming.filter(
      (order) => order.status === 'new' && knownIds.value.size && !knownIds.value.has(order.id),
    )

    if (brandNew.length) {
      playChime()
      const flashed = new Set(flashIds.value)
      for (const order of brandNew) flashed.add(order.id)
      flashIds.value = flashed
      window.setTimeout(() => {
        const next = new Set(flashIds.value)
        for (const order of brandNew) next.delete(order.id)
        flashIds.value = next
      }, 8000)
    }

    orders.value = incoming
    newCount.value = result.newCount
    syncAppBadge(result.newCount)
    knownIds.value = nextIds
    lastSyncedAt.value = new Date().toISOString()
    // Remember only after the server accepted the token (installed PWA reuses it).
    persistAdminToken()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить заказы'
    if (err?.status === 401 || err?.status === 503) {
      logout()
    }
  } finally {
    isLoading.value = false
    ordersInFlight = false
  }
}

function login() {
  const token = tokenInput.value.trim()
  if (!token) {
    error.value = 'Введите токен администратора'
    return
  }
  setAdminToken(token)
  isAuthed.value = true
  error.value = ''
  knownIds.value = new Set()
  loadOrders()
  syncPushSubscription()
}

function logout() {
  clearAdminToken()
  isAuthed.value = false
  activeSection.value = 'orders'
  orders.value = []
  newCount.value = 0
  syncAppBadge(0)
  stopPolling()
}

async function setStatus(order, status) {
  isUpdating.value = order.id
  error.value = ''
  try {
    const updated = await updateAdminOrderStatus(order.id, status)
    orders.value = orders.value.map((item) => (item.id === updated.id ? updated : item))
    newCount.value = orders.value.filter((item) => item.status === 'new').length
    syncAppBadge(newCount.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось обновить статус'
    if (err?.status === 401) logout()
  } finally {
    isUpdating.value = ''
  }
}

const statusLabel = {
  new: 'Новый',
  paid: 'Оплачен',
  shipped: 'Отгружен',
  cancelled: 'Отменен',
}

function startPolling() {
  stopPolling()
  if (activeSection.value !== 'orders') return
  if (typeof document !== 'undefined' && document.hidden) return
  pollTimer = window.setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    loadOrders({ silent: true })
  }, POLL_MS)
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

function onVisibilityChange() {
  if (!isAuthed.value || activeSection.value !== 'orders') return
  if (document.hidden) stopPolling()
  else {
    loadOrders({ silent: true })
    startPolling()
  }
}

watch(isAuthed, (value) => {
  if (value && activeSection.value === 'orders') startPolling()
  else stopPolling()
})

watch(activeSection, (section) => {
  if (!isAuthed.value) return
  if (section === 'orders') {
    startPolling()
  } else {
    // Stop order polling while reports run so MoySklad queue is not starved.
    stopPolling()
  }
})

onMounted(() => {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  if (isAuthed.value) {
    loadOrders()
    if (activeSection.value === 'orders') startPolling()
    syncPushSubscription()
  }
})

onUnmounted(() => {
  stopPolling()
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
})
</script>

<template>
  <div class="admin container">
    <header class="admin__head">
      <div>
        <p class="eyebrow">Литком-М52</p>
        <h1 class="display">Админка М52</h1>
        <p v-if="!isAuthed" class="muted">Токен из переменной ADMIN_TOKEN на сервере.</p>
      </div>
      <div class="admin__aside">
        <template v-if="isAuthed">
          <div class="admin__meta-row">
            <span class="badge" :class="{ 'badge--hot': newCount > 0 }">
              Новых: {{ newCount }}
            </span>
            <InstallAppButton variant="header" label="Установить админку" />
            <PushToggle audience="admin" />
            <ThemeToggle />
            <button class="admin-logout" type="button" @click="logout">Выйти</button>
          </div>
          <span class="muted sync">
            {{ lastSyncedAt ? `Обновлено ${formatDate(lastSyncedAt)}` : 'Ожидание…' }}
          </span>
        </template>
        <div v-else class="admin__meta-row">
          <InstallAppButton variant="header" label="Установить админку" />
          <ThemeToggle />
        </div>
      </div>
    </header>

    <div
      v-if="isAuthed"
      class="admin-tabs"
      role="tablist"
      aria-label="Разделы админки"
    >
      <button
        v-for="tab in SECTIONS"
        :key="tab.key"
        type="button"
        role="tab"
        class="admin-tabs__tab"
        :class="{ 'admin-tabs__tab--active': activeSection === tab.key }"
        :aria-selected="activeSection === tab.key"
        :tabindex="activeSection === tab.key ? 0 : -1"
        @click="setSection(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <section v-if="!isAuthed" class="panel login reveal">
      <h2>Вход</h2>
      <p class="muted">Токен из переменной ADMIN_TOKEN на сервере.</p>
      <form class="login__form" @submit.prevent="login">
        <label>
          Токен
          <input v-model="tokenInput" type="password" autocomplete="current-password" />
        </label>
        <button class="btn btn-primary" type="submit">Войти</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <div v-else class="admin-panels" role="tabpanel">
      <AdminOrders
        v-if="activeSection === 'orders'"
        :filtered-orders="filteredOrders"
        :filter="filter"
        :is-loading="isLoading"
        :is-updating="isUpdating"
        :sound-enabled="soundEnabled"
        :error="error"
        :flash-ids="flashIds"
        :status-label="statusLabel"
        @set-filter="filter = $event"
        @toggle-sound="soundEnabled = $event"
        @refresh="loadOrders()"
        @set-status="setStatus"
      />
      <AdminPurchases v-else-if="activeSection === 'purchases'" />
      <AdminReports v-else-if="activeSection === 'reports'" />
    </div>
  </div>
</template>

<style scoped>
.admin {
  padding: 2rem 0 3rem;
  max-width: 960px;
}

/* Все кнопки админки — угловатый стиль (не пилюли). */
.admin :deep(.btn),
.admin :deep(.chip),
.admin :deep(.btn-block) {
  border-radius: 12px;
}

.admin__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1.4rem;
}

.eyebrow {
  margin: 0 0 0.4rem;
  color: var(--green);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
  font-weight: 700;
}

.display {
  margin: 0 0 0.5rem;
  font-size: clamp(1.7rem, 4vw, 2.4rem);
}

.admin-tabs {
  display: flex;
  width: 100%;
  margin: 0 0 1.25rem;
  box-shadow: inset 0 -1px 0 var(--line);
}

.admin-tabs__tab {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  padding: 0.9rem 0.5rem;
  border: 0;
  background: transparent;
  color: var(--ink-muted);
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  font: inherit;
  font-size: 1.08rem;
  font-weight: 600;
  transition: color 0.15s ease;
}

.admin-tabs__tab::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: transparent;
  transition: background 0.15s ease;
}

.admin-tabs__tab:hover {
  color: var(--ink);
}

.admin-tabs__tab--active {
  color: var(--ink);
}

.admin-tabs__tab--active::after {
  background: var(--green);
}

.admin-panels {
  min-width: 0;
}

.admin__aside {
  display: grid;
  gap: 0.45rem;
  justify-items: end;
}

.admin__meta-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.admin-logout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.6rem;
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--green);
  font: inherit;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.admin-logout:hover {
  background: var(--nav-hover);
  border-color: var(--btn-ghost-hover);
}

.badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 0.85rem;
  font-weight: 700;
  white-space: nowrap;
}

.badge--hot {
  border-color: var(--accent-border-strong);
  color: var(--on-green);
  background: linear-gradient(145deg, var(--green-soft), var(--green));
  animation: pulse 1.6s ease-in-out infinite;
}

.panel {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 1.15rem;
}

.login__form {
  display: grid;
  gap: 0.85rem;
  margin-top: 1rem;
}

.login label {
  display: grid;
  gap: 0.4rem;
  color: var(--ink-muted);
  font-size: 0.9rem;
}

.login input {
  width: 100%;
  padding: 0.8rem 0.9rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--inset);
  color: var(--ink);
}

.error {
  color: var(--danger-text);
  margin: 0 0 1rem;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.04);
  }
}

@media (max-width: 720px) {
  .admin__head {
    flex-direction: column;
    align-items: stretch;
  }

  .admin__aside {
    justify-items: start;
  }
}
</style>
