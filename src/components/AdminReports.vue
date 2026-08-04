<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  orders: { type: Array, required: true },
  newCount: { type: Number, required: true },
  lastSyncedAt: { type: String, default: '' },
})

const dateFrom = ref('')
const dateTo = ref('')

function formatMoney(value) {
  if (!Number.isFinite(Number(value))) return '0 ₽'
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

const periodOrders = computed(() => {
  const fromTs = dateFrom.value ? new Date(`${dateFrom.value}T00:00:00`).getTime() : null
  const toTs = dateTo.value ? new Date(`${dateTo.value}T23:59:59`).getTime() : null

  return props.orders.filter((order) => {
    const ts = new Date(order.createdAt || '').getTime()
    if (!Number.isFinite(ts)) return false
    if (fromTs !== null && ts < fromTs) return false
    if (toTs !== null && ts > toTs) return false
    return true
  })
})

const newCountByPeriod = computed(
  () => periodOrders.value.filter((order) => order.status === 'new').length,
)
const paidCount = computed(() => periodOrders.value.filter((order) => order.status === 'paid').length)
const shippedCount = computed(
  () => periodOrders.value.filter((order) => order.status === 'shipped').length,
)
const cancelledCount = computed(
  () => periodOrders.value.filter((order) => order.status === 'cancelled').length,
)
const totalSum = computed(() =>
  periodOrders.value.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
)
</script>

<template>
  <section class="panel reports">
    <h2>Отчеты</h2>
    <div class="periods">
      <label>
        С
        <input v-model="dateFrom" type="date" />
      </label>
      <label>
        По
        <input v-model="dateTo" type="date" />
      </label>
    </div>
    <div class="reports__grid">
      <article class="report-card">
        <p class="muted">Всего заказов</p>
        <strong>{{ periodOrders.length }}</strong>
      </article>
      <article class="report-card">
        <p class="muted">Новых</p>
        <strong>{{ newCountByPeriod }}</strong>
      </article>
      <article class="report-card">
        <p class="muted">Оплачено</p>
        <strong>{{ paidCount }}</strong>
      </article>
      <article class="report-card">
        <p class="muted">Отгружено</p>
        <strong>{{ shippedCount }}</strong>
      </article>
      <article class="report-card">
        <p class="muted">Отменено</p>
        <strong>{{ cancelledCount }}</strong>
      </article>
      <article class="report-card">
        <p class="muted">Сумма заказов</p>
        <strong>{{ formatMoney(totalSum) }}</strong>
      </article>
    </div>
    <p class="muted reports__sync">
      {{ lastSyncedAt ? `Обновлено: ${formatDate(lastSyncedAt)}` : 'Ожидание синхронизации…' }}
    </p>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 1.15rem;
}

.reports {
  margin-top: 1rem;
}

.reports h2 {
  margin: 0 0 0.9rem;
}

.periods {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}

.periods label {
  display: grid;
  gap: 0.3rem;
  color: var(--ink-muted);
  font-size: 0.85rem;
}

.periods input {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
  background: var(--inset);
  color: var(--ink);
  font: inherit;
}

.reports__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.55rem;
}

.report-card {
  border: 1px solid var(--line-faint);
  border-radius: 12px;
  padding: 0.75rem 0.85rem;
  background: var(--inset-soft);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}

.report-card p {
  margin: 0;
  font-size: 0.85rem;
}

.report-card strong {
  display: inline-block;
  font-size: 1.1rem;
  white-space: nowrap;
}

.reports__sync {
  margin: 0.9rem 0 0;
}
</style>
