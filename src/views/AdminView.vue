<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  clearAdminToken,
  fetchAdminOrders,
  getAdminToken,
  setAdminToken,
  updateAdminOrderStatus,
} from '../services/moysklad'

const POLL_MS = 5000

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
const knownIds = ref(new Set())
const flashIds = ref(new Set())

let pollTimer = null
let audioCtx = null

const filteredOrders = computed(() => {
  if (filter.value === 'all') return orders.value
  return orders.value.filter((order) => order.status === filter.value)
})

const statusLabel = {
  new: 'Новый',
  seen: 'Просмотрен',
  done: 'Обработан',
}

function formatMoney(value) {
  if (!Number.isFinite(Number(value))) return '—'
  return `${Number(value).toLocaleString('ru-RU')} ₽`
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
    knownIds.value = nextIds
    lastSyncedAt.value = new Date().toISOString()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить заказы'
    if (err?.status === 401 || err?.status === 503) {
      logout()
    }
  } finally {
    isLoading.value = false
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
}

function logout() {
  clearAdminToken()
  isAuthed.value = false
  orders.value = []
  newCount.value = 0
  stopPolling()
}

async function setStatus(order, status) {
  isUpdating.value = order.id
  error.value = ''
  try {
    const updated = await updateAdminOrderStatus(order.id, status)
    orders.value = orders.value.map((item) => (item.id === updated.id ? updated : item))
    newCount.value = orders.value.filter((item) => item.status === 'new').length
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось обновить статус'
    if (err?.status === 401) logout()
  } finally {
    isUpdating.value = ''
  }
}

function startPolling() {
  stopPolling()
  pollTimer = window.setInterval(() => loadOrders({ silent: true }), POLL_MS)
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(isAuthed, (value) => {
  if (value) startPolling()
  else stopPolling()
})

onMounted(() => {
  if (isAuthed.value) {
    loadOrders()
    startPolling()
  }
})

onUnmounted(stopPolling)
</script>

<template>
  <div class="admin container">
    <header class="admin__head">
      <div>
        <p class="eyebrow">Литком ЕКБ</p>
        <h1 class="display">Админка заказов</h1>
        <p class="muted">Новые заказы с витрины появляются здесь автоматически.</p>
      </div>
      <div v-if="isAuthed" class="admin__meta">
        <span class="badge" :class="{ 'badge--hot': newCount > 0 }">
          Новых: {{ newCount }}
        </span>
        <span class="muted sync">
          {{ lastSyncedAt ? `Обновлено ${formatDate(lastSyncedAt)}` : 'Ожидание…' }}
        </span>
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
      <div class="toolbar">
        <div class="filters">
          <button
            type="button"
            class="chip"
            :class="{ 'chip--active': filter === 'all' }"
            @click="filter = 'all'"
          >
            Все
          </button>
          <button
            type="button"
            class="chip"
            :class="{ 'chip--active': filter === 'new' }"
            @click="filter = 'new'"
          >
            Новые
          </button>
          <button
            type="button"
            class="chip"
            :class="{ 'chip--active': filter === 'seen' }"
            @click="filter = 'seen'"
          >
            Просмотренные
          </button>
          <button
            type="button"
            class="chip"
            :class="{ 'chip--active': filter === 'done' }"
            @click="filter = 'done'"
          >
            Обработанные
          </button>
        </div>
        <div class="toolbar__actions">
          <label class="sound">
            <input v-model="soundEnabled" type="checkbox" />
            Звук
          </label>
          <button class="btn btn-ghost" type="button" :disabled="isLoading" @click="loadOrders()">
            {{ isLoading ? 'Загрузка…' : 'Обновить' }}
          </button>
          <button class="btn btn-ghost" type="button" @click="logout">Выйти</button>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div v-if="!filteredOrders.length && !isLoading" class="empty panel">
        <h2>Пока пусто</h2>
        <p class="muted">Как только кто-то оформит заказ на витрине — он появится здесь.</p>
      </div>

      <ul class="orders">
        <li
          v-for="order in filteredOrders"
          :key="order.id"
          class="order panel"
          :class="{
            'order--new': order.status === 'new',
            'order--flash': flashIds.has(order.id),
          }"
        >
          <div class="order__top">
            <div>
              <div class="order__title">
                <span class="status" :data-status="order.status">
                  {{ statusLabel[order.status] || order.status }}
                </span>
                <strong>
                  {{ order.customer?.counterparty?.name || 'Контрагент не указан' }}
                </strong>
              </div>
              <p class="muted order__time">{{ formatDate(order.createdAt) }}</p>
              <p v-if="order.customer?.contact" class="muted">
                Контакт: {{ order.customer.contact }}
              </p>
            </div>
            <div class="order__sum">{{ formatMoney(order.total) }}</div>
          </div>

          <ul class="lines">
            <li v-for="(item, index) in order.items" :key="`${order.id}-${item.id || index}`">
              <span>{{ item.name || item.id }}</span>
              <span class="muted">
                {{ item.qty }} × {{ Number(item.price || 0).toLocaleString('ru-RU') }} ₽
              </span>
            </li>
          </ul>

          <div class="order__foot">
            <p v-if="order.moySklad?.name" class="muted">
              МойСклад:
              <a
                v-if="order.moySklad.href"
                :href="order.moySklad.href"
                target="_blank"
                rel="noreferrer"
              >
                {{ order.moySklad.name }}
              </a>
              <template v-else>{{ order.moySklad.name }}</template>
            </p>
            <div class="order__actions">
              <button
                v-if="order.status === 'new'"
                class="btn btn-ghost"
                type="button"
                :disabled="isUpdating === order.id"
                @click="setStatus(order, 'seen')"
              >
                Просмотрен
              </button>
              <button
                v-if="order.status !== 'done'"
                class="btn btn-primary"
                type="button"
                :disabled="isUpdating === order.id"
                @click="setStatus(order, 'done')"
              >
                Обработан
              </button>
              <button
                v-if="order.status === 'done'"
                class="btn btn-ghost"
                type="button"
                :disabled="isUpdating === order.id"
                @click="setStatus(order, 'new')"
              >
                Вернуть в новые
              </button>
            </div>
          </div>
        </li>
      </ul>
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

.admin__meta {
  display: grid;
  gap: 0.45rem;
  justify-items: end;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(11, 21, 16, 0.8);
  font-size: 0.85rem;
  font-weight: 700;
}

.badge--hot {
  border-color: rgba(62, 207, 142, 0.55);
  color: #04120b;
  background: linear-gradient(145deg, var(--green-soft), var(--green));
  animation: pulse 1.6s ease-in-out infinite;
}

.panel {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(11, 21, 16, 0.72);
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
  background: rgba(0, 0, 0, 0.28);
  color: var(--ink);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.filters,
.toolbar__actions,
.order__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.chip {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink-muted);
  border-radius: 999px;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}

.chip--active {
  color: var(--ink);
  background: rgba(62, 207, 142, 0.12);
  border-color: rgba(62, 207, 142, 0.4);
}

.sound {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--ink-muted);
  font-size: 0.9rem;
}

.orders {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.9rem;
}

.order--new {
  border-color: rgba(62, 207, 142, 0.45);
  box-shadow: 0 0 0 1px rgba(62, 207, 142, 0.12);
}

.order--flash {
  animation: flash-in 0.8s ease;
}

.order__top {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.order__title {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
}

.order__title strong {
  font-size: 1.05rem;
}

.order__time {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
}

.order__sum {
  font-family: var(--font-display);
  font-size: 1.15rem;
  white-space: nowrap;
}

.status {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--line);
}

.status[data-status='new'] {
  color: #04120b;
  background: var(--green);
  border-color: transparent;
}

.status[data-status='seen'] {
  color: var(--green-soft);
}

.status[data-status='done'] {
  color: var(--ink-muted);
}

.lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.lines li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid rgba(62, 207, 142, 0.1);
  font-size: 0.95rem;
}

.order__foot {
  margin-top: 1rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
}

.error {
  color: #ff9a9a;
  margin: 0 0 1rem;
}

.empty h2 {
  margin: 0 0 0.4rem;
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

@keyframes flash-in {
  from {
    background: rgba(62, 207, 142, 0.22);
  }
  to {
    background: rgba(11, 21, 16, 0.72);
  }
}

@media (max-width: 720px) {
  .admin__head,
  .order__top,
  .order__foot {
    flex-direction: column;
    align-items: stretch;
  }

  .admin__meta {
    justify-items: start;
  }
}
</style>
