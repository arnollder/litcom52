<script setup>
import { onMounted, ref, watch } from 'vue'
import { fetchAdminReports } from '../services/moysklad'

function toIsoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const today = new Date()
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
const dateFrom = ref(toIsoDate(monthStart))
const dateTo = ref(toIsoDate(today))
const isLoading = ref(false)
const error = ref('')
const metrics = ref({
  soldShipped: 0,
  purchasedSupplies: 0,
  stockTotal: 0,
})

function formatMoney(value) {
  if (!Number.isFinite(Number(value))) return '0 ₽'
  return `${Number(value).toLocaleString('ru-RU')} ₽`
}

function formatDateRu(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

let fetchTimer = null
let loadSeq = 0

async function loadReports() {
  const seq = ++loadSeq
  isLoading.value = true
  error.value = ''
  try {
    const nextMetrics = await fetchAdminReports({
      fromDate: dateFrom.value,
      toDate: dateTo.value,
    })
    if (seq !== loadSeq) return
    metrics.value = nextMetrics
  } catch (err) {
    if (seq !== loadSeq) return
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить отчеты'
  } finally {
    if (seq === loadSeq) isLoading.value = false
  }
}

watch([dateFrom, dateTo], () => {
  window.clearTimeout(fetchTimer)
  fetchTimer = window.setTimeout(() => {
    loadReports()
  }, 500)
})

onMounted(loadReports)
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
    <p class="muted period-view">
      Период:
      <strong>{{ formatDateRu(dateFrom) }}</strong>
      —
      <strong>{{ formatDateRu(dateTo) }}</strong>
    </p>
    <div class="reports__grid">
      <article class="report-card">
        <p class="muted">Продано литературы</p>
        <strong>{{ formatMoney(metrics.soldShipped) }}</strong>
      </article>
      <article class="report-card">
        <p class="muted">Закуплено</p>
        <strong>{{ formatMoney(metrics.purchasedSupplies) }}</strong>
      </article>
      <article class="report-card">
        <p class="muted">Остаток на складе</p>
        <strong>{{ formatMoney(metrics.stockTotal) }}</strong>
      </article>
    </div>
    <p v-if="isLoading" class="muted reports__state">Считаем отчет…</p>
    <p v-else-if="error" class="error reports__state">{{ error }}</p>
    <p v-else class="muted reports__state">
      Источник: МойСклад («Заказы покупателей», «Закупки - Приемки», «Остатки на складе»).
      Продано: статусы «Оплачен» и «Отгружен». Остаток: фактический stock на конец даты «По», без резерва.
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

.period-view {
  margin: -0.2rem 0 0.9rem;
  font-size: 0.88rem;
}

.period-view strong {
  color: var(--ink);
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

.reports__state {
  margin: 0.9rem 0 0;
}

.error {
  color: var(--danger-text);
}
</style>
