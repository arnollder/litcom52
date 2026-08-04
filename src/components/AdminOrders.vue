<script setup>
const props = defineProps({
  filteredOrders: { type: Array, required: true },
  filter: { type: String, required: true },
  isLoading: { type: Boolean, required: true },
  isUpdating: { type: String, required: true },
  soundEnabled: { type: Boolean, required: true },
  error: { type: String, default: '' },
  flashIds: { type: Object, required: true },
  statusLabel: { type: Object, required: true },
})

const emit = defineEmits(['set-filter', 'toggle-sound', 'refresh', 'logout', 'set-status'])

function canMarkPaid(order) {
  return order.status === 'new'
}

function canMarkShipped(order) {
  return Boolean(order.canShip) || order.status === 'paid'
}

function shipDisabled(order) {
  if (props.isUpdating === order.id) return true
  if (order.status === 'shipped') return true
  return !canMarkShipped(order)
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
</script>

<template>
  <div>
    <div class="toolbar">
      <div class="filters">
        <button
          type="button"
          class="chip"
          :class="{ 'chip--active': filter === 'all' }"
          @click="emit('set-filter', 'all')"
        >
          Все
        </button>
        <button
          type="button"
          class="chip"
          :class="{ 'chip--active': filter === 'new' }"
          @click="emit('set-filter', 'new')"
        >
          Новые
        </button>
        <button
          type="button"
          class="chip"
          :class="{ 'chip--active': filter === 'paid' }"
          @click="emit('set-filter', 'paid')"
        >
          Оплаченные
        </button>
        <button
          type="button"
          class="chip"
          :class="{ 'chip--active': filter === 'shipped' }"
          @click="emit('set-filter', 'shipped')"
        >
          Отгруженные
        </button>
      </div>
      <div class="toolbar__actions">
        <label class="sound">
          <input
            :checked="soundEnabled"
            type="checkbox"
            @change="emit('toggle-sound', $event.target.checked)"
          />
          Звук
        </label>
        <button class="btn btn-ghost" type="button" :disabled="isLoading" @click="emit('refresh')">
          {{ isLoading ? 'Загрузка…' : 'Обновить' }}
        </button>
        <button class="btn btn-ghost" type="button" @click="emit('logout')">Выйти</button>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="!filteredOrders.length && !isLoading" class="empty panel">
      <h2>Пока пусто</h2>
      <p class="muted">В МойСклад пока нет заказов покупателей.</p>
    </div>

    <ul class="orders">
      <li
        v-for="order in filteredOrders"
        :key="order.id"
        class="order panel"
        :class="{
          'order--new': order.status === 'new',
          'order--flash': flashIds.has(order.id),
          'order--storefront': order.fromStorefront,
        }"
      >
        <div class="order__top">
          <div>
            <div class="order__title">
              <span class="status" :data-status="order.status">
                {{ statusLabel[order.status] || order.moySklad?.stateName || order.status }}
              </span>
              <strong>
                №{{ order.moySklad?.name || '—' }} ·
                {{ order.customer?.counterparty?.name || 'Контрагент не указан' }}
              </strong>
              <span v-if="order.fromStorefront" class="tag">С этого сервиса</span>
            </div>
            <p class="muted order__time">{{ formatDate(order.createdAt) }}</p>
            <p v-if="order.comment" class="order__comment">{{ order.comment }}</p>
            <p v-if="order.customer?.contact" class="muted">Контакт: {{ order.customer.contact }}</p>
          </div>
          <div class="order__sum">{{ formatMoney(order.total) }}</div>
        </div>

        <ul class="lines">
          <li v-for="(item, index) in order.items" :key="`${order.id}-${item.id || index}`">
            <span>{{ item.name || item.id }}</span>
            <span class="muted">{{ item.qty }} × {{ Number(item.price || 0).toLocaleString('ru-RU') }} ₽</span>
          </li>
        </ul>

        <div class="order__foot">
          <div class="order__ms">
            <p v-if="order.moySklad?.name" class="muted">
              МойСклад:
              <a v-if="order.moySklad.href" :href="order.moySklad.href" target="_blank" rel="noreferrer">
                {{ order.moySklad.name }}
              </a>
              <template v-else>{{ order.moySklad.name }}</template>
            </p>
            <p v-if="order.moySklad?.stateName" class="muted">Статус МС: {{ order.moySklad.stateName }}</p>
            <p v-if="order.moySkladSyncError" class="error">{{ order.moySkladSyncError }}</p>
          </div>
          <div class="order__actions">
            <button
              v-if="canMarkPaid(order)"
              class="btn btn-primary"
              type="button"
              :disabled="isUpdating === order.id"
              @click="emit('set-status', order, 'paid')"
            >
              Оплачен
            </button>
            <button
              v-if="order.status !== 'shipped'"
              class="btn btn-ghost"
              type="button"
              :disabled="shipDisabled(order)"
              :title="
                shipDisabled(order) && order.status !== 'shipped'
                  ? 'Сначала отметьте оплату в МойСклад'
                  : ''
              "
              @click="emit('set-status', order, 'shipped')"
            >
              Отгружен
            </button>
            <span v-else class="muted shipped-label">Отгружен</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.panel {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 1.15rem;
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
  background: var(--accent-fill);
  border-color: var(--accent-border);
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

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.order--new {
  border-color: var(--btn-ghost-hover);
  box-shadow: 0 0 0 1px var(--accent-border-faint);
}

.order--storefront {
  border-color: var(--accent-border-mid);
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

.order__comment {
  margin: 0.45rem 0 0;
  color: var(--ink);
  font-size: 0.92rem;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--accent-border);
  background: var(--accent-fill);
  color: var(--green-soft);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
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
  color: var(--on-green);
  background: var(--green);
  border-color: transparent;
}

.status[data-status='paid'] {
  color: var(--on-green);
  background: var(--green-soft);
  border-color: transparent;
}

.status[data-status='shipped'] {
  color: var(--ink-muted);
}

.status[data-status='cancelled'] {
  color: var(--danger-text);
}

.order__ms {
  display: grid;
  gap: 0.2rem;
}

.order__ms p {
  margin: 0;
}

.shipped-label {
  font-size: 0.9rem;
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
  border-bottom: 1px solid var(--line-faint);
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
  color: var(--danger-text);
  margin: 0 0 1rem;
}

.empty h2 {
  margin: 0 0 0.4rem;
}

@keyframes flash-in {
  from {
    background: var(--accent-fill-strong);
  }
  to {
    background: var(--surface);
  }
}

@media (max-width: 720px) {
  .order__top,
  .order__foot {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
