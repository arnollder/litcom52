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
import AdminReports from '../components/AdminReports.vue'
import InstallAppButton from '../components/InstallAppButton.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { syncAppBadge, useAdminPush } from '../composables/useAdminPush.js'

const POLL_MS = 15_000

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
  supported: pushSupported,
  enabled: pushEnabled,
  permission: pushPermission,
  busy: pushBusy,
  error: pushError,
  canEnable: canEnablePush,
  canDisable: canDisablePush,
  canRetryDenied: canRetryDeniedPush,
  enable: enablePush,
  disable: disablePush,
  syncSubscription: syncPushSubscription,
} = useAdminPush()

const filteredOrders = computed(() => {
  if (filter.value === 'all') return orders.value
  return orders.value.filter((order) => order.status === filter.value)
})

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
  pollTimer = window.setInterval(() => loadOrders({ silent: true }), POLL_MS)
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
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
  if (isAuthed.value) {
    loadOrders()
    if (activeSection.value === 'orders') startPolling()
    syncPushSubscription()
  }
})

onUnmounted(stopPolling)
</script>

<template>
  <div class="admin container">
    <header class="admin__head">
      <div>
        <p class="eyebrow">Литком-М52</p>
        <h1 class="display">Админка М52</h1>
        <p class="muted">Список соответствует разделу «Заказы покупателей» в МойСклад.</p>
        <div v-if="isAuthed" class="head-tabs">
          <button
            type="button"
            class="head-tab"
            :class="{ 'head-tab--active': activeSection === 'orders' }"
            @click="activeSection = 'orders'"
          >
            Заказы
          </button>
          <button
            type="button"
            class="head-tab"
            :class="{ 'head-tab--active': activeSection === 'reports' }"
            @click="activeSection = 'reports'"
          >
            Отчеты
          </button>
        </div>
      </div>
      <div class="admin__aside">
        <template v-if="isAuthed">
          <div class="admin__meta-row">
            <span class="badge" :class="{ 'badge--hot': newCount > 0 }">
              Новых: {{ newCount }}
            </span>
            <InstallAppButton variant="header" label="Установить админку" />
            <button
              v-if="pushSupported"
              type="button"
              class="btn btn-ghost push-btn"
              :disabled="pushBusy || (!canEnablePush && !canDisablePush && !canRetryDeniedPush)"
              @click="pushEnabled ? disablePush() : enablePush()"
            >
              {{ pushEnabled ? 'Push: вкл' : pushPermission === 'denied' ? 'Push: запрещён' : 'Push: выкл' }}
            </button>
            <ThemeToggle />
          </div>
          <p v-if="pushError" class="push-error">{{ pushError }}</p>
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

    <template v-else>
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
        @logout="logout"
        @set-status="setStatus"
      />
      <AdminReports v-else />
    </template>
  </div>
</template>

<style scoped>
.admin {
  padding: 2rem 0 3rem;
  max-width: 960px;
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

.head-tabs {
  margin-top: 0.9rem;
  display: inline-flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.head-tab {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink-muted);
  border-radius: 999px;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}

.head-tab--active {
  color: var(--ink);
  background: var(--accent-fill);
  border-color: var(--accent-border);
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

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 0.85rem;
  font-weight: 700;
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

.push-error {
  color: var(--danger-text);
  margin: 0;
  font-size: 0.82rem;
}

.push-btn {
  font-size: 0.82rem;
  padding: 0.35rem 0.65rem;
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
