<script setup>
import { computed } from 'vue'

const props = defineProps({
  orders: { type: Array, required: true },
  newCount: { type: Number, required: true },
  lastSyncedAt: { type: String, default: '' },
})

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

const paidCount = computed(() => props.orders.filter((order) => order.status === 'paid').length)
const shippedCount = computed(() => props.orders.filter((order) => order.status === 'shipped').length)
const cancelledCount = computed(
  () => props.orders.filter((order) => order.status === 'cancelled').length,
)
const totalSum = computed(() =>
  props.orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
)
</script>

<template>
  <section class="panel reports">
    <h2>Отчеты</h2>
    <div class="reports__grid">
      <article class="report-card">
        <p class="muted">Всего заказов</p>
        <strong>{{ orders.length }}</strong>
      </article>
      <article class="report-card">
        <p class="muted">Новых</p>
        <strong>{{ newCount }}</strong>
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

.reports__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.65rem;
}

.report-card {
  border: 1px solid var(--line-faint);
  border-radius: 12px;
  padding: 0.75rem 0.85rem;
  background: var(--inset-soft);
}

.report-card p {
  margin: 0;
  font-size: 0.85rem;
}

.report-card strong {
  margin-top: 0.35rem;
  display: block;
  font-size: 1.1rem;
}

.reports__sync {
  margin: 0.9rem 0 0;
}
</style>
