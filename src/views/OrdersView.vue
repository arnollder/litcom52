<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import QtyControl from '../components/QtyControl.vue'
import { fetchCustomerOrders, fetchLiveStock, updateCustomerOrder } from '../services/moysklad'
import { getSavedCounterparty } from '../utils/counterparty.js'

const STATUS_LABEL = {
  new: 'Новый',
  paid: 'Оплачен',
  shipped: 'Отгружен',
  cancelled: 'Отменён',
}

const counterparty = ref(getSavedCounterparty())
const orders = ref([])
const isLoading = ref(false)
const error = ref('')
const editingId = ref('')
const draftItems = ref([])
const stockById = ref({})
const isSaving = ref(false)
const saveError = ref('')

const hasCounterparty = computed(() => Boolean(counterparty.value?.id))

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function formatMoney(value) {
  if (!Number.isFinite(Number(value))) return '—'
  return `${Number(value).toLocaleString('ru-RU')} ₽`
}

function statusClass(status) {
  return `status status--${status || 'new'}`
}

function lineTotal(item) {
  return (Number(item.qty) || 0) * (Number(item.price) || 0)
}

const draftTotal = computed(() =>
  draftItems.value.reduce((sum, item) => sum + lineTotal(item), 0),
)

function maxQtyForItem(item) {
  const id = String(item.id || '')
  const free = Number(stockById.value[id]) || 0
  const current = Number(item.qty) || 0
  return Math.max(current, free + current, 99)
}

async function loadOrders() {
  if (!counterparty.value?.id) return
  isLoading.value = true
  error.value = ''
  try {
    const result = await fetchCustomerOrders(counterparty.value.id)
    orders.value = result.orders
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить заказы'
  } finally {
    isLoading.value = false
  }
}

async function startEdit(order) {
  if (!order.canEdit) return
  editingId.value = order.id
  saveError.value = ''
  draftItems.value = order.items.map((item) => ({ ...item }))
  try {
    const stock = await fetchLiveStock()
    stockById.value = stock.stockById || {}
  } catch {
    stockById.value = {}
  }
}

function cancelEdit() {
  editingId.value = ''
  draftItems.value = []
  saveError.value = ''
}

async function saveEdit(order) {
  if (!counterparty.value?.id || isSaving.value) return
  const items = draftItems.value.filter((item) => Number(item.qty) > 0)
  if (!items.length) {
    saveError.value = 'Добавьте хотя бы одну позицию'
    return
  }

  isSaving.value = true
  saveError.value = ''
  try {
    const updated = await updateCustomerOrder(order.id, {
      counterpartyId: counterparty.value.id,
      items,
    })
    orders.value = orders.value.map((row) => (row.id === updated.id ? updated : row))
    cancelEdit()
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Не удалось сохранить'
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  counterparty.value = getSavedCounterparty()
  if (hasCounterparty.value) loadOrders()
})
</script>

<template>
  <div class="container orders">
    <header class="orders__head reveal">
      <div>
        <p class="eyebrow">Личный кабинет</p>
        <h1 class="display">Мои заказы</h1>
        <p v-if="hasCounterparty" class="muted">
          Контрагент: <strong>{{ counterparty.name }}</strong>
        </p>
        <p v-else class="muted">
          Сначала выберите контрагента при оформлении — тогда здесь появится история заказов.
        </p>
      </div>
      <RouterLink v-if="!hasCounterparty" class="btn btn-primary" to="/checkout">
        Перейти к оформлению
      </RouterLink>
      <button
        v-else
        type="button"
        class="btn btn-ghost"
        :disabled="isLoading"
        @click="loadOrders"
      >
        {{ isLoading ? 'Обновление…' : 'Обновить' }}
      </button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="!hasCounterparty" class="panel reveal">
      <p>Контрагент сохраняется на странице оформления после выбора из списка МойСклад.</p>
    </section>

    <section v-else-if="isLoading && !orders.length" class="panel reveal muted">
      Загружаем заказы…
    </section>

    <section v-else-if="!orders.length" class="panel reveal">
      <p class="muted">Заказов пока нет.</p>
      <RouterLink class="btn btn-primary" to="/shop">Перейти в каталог</RouterLink>
    </section>

    <div v-else class="orders__list">
      <article
        v-for="order in orders"
        :key="order.id"
        class="order-card reveal"
        :class="{ 'order-card--editing': editingId === order.id }"
      >
        <header class="order-card__head">
          <div>
            <h2 class="order-card__title">
              Заказ №{{ order.moySklad?.name || '—' }}
            </h2>
            <p class="muted order-card__meta">{{ formatDate(order.createdAt) }}</p>
          </div>
          <span :class="statusClass(order.status)">
            {{ STATUS_LABEL[order.status] || order.moySklad?.stateName || order.status }}
          </span>
        </header>

        <ul v-if="editingId !== order.id" class="order-card__items">
          <li v-for="item in order.items" :key="item.id">
            <span>{{ item.name }}</span>
            <span class="order-card__qty">{{ item.qty }} × {{ formatMoney(item.price) }}</span>
          </li>
        </ul>

        <div v-else class="order-edit">
          <ul class="order-edit__items">
            <li v-for="item in draftItems" :key="item.id" class="order-edit__row">
              <span class="order-edit__name">{{ item.name }}</span>
              <QtyControl
                :model-value="item.qty"
                :max="maxQtyForItem(item)"
                @update:model-value="item.qty = $event"
              />
              <span class="order-edit__sum">{{ formatMoney(lineTotal(item)) }}</span>
            </li>
          </ul>
          <p class="order-edit__total">Итого: <strong>{{ formatMoney(draftTotal) }}</strong></p>
          <p v-if="saveError" class="error">{{ saveError }}</p>
          <div class="order-edit__actions">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="isSaving"
              @click="saveEdit(order)"
            >
              {{ isSaving ? 'Сохранение…' : 'Сохранить' }}
            </button>
            <button type="button" class="btn btn-ghost" :disabled="isSaving" @click="cancelEdit">
              Отмена
            </button>
          </div>
        </div>

        <footer v-if="editingId !== order.id" class="order-card__foot">
          <strong>{{ formatMoney(order.total) }}</strong>
          <button
            v-if="order.canEdit"
            type="button"
            class="btn btn-ghost order-card__edit"
            @click="startEdit(order)"
          >
            Редактировать
          </button>
        </footer>
      </article>
    </div>
  </div>
</template>

<style scoped>
.orders {
  padding: 2rem 0 3rem;
  max-width: 720px;
}

.orders__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
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
  font-size: clamp(1.7rem, 4vw, 2.2rem);
}

.orders__list {
  display: grid;
  gap: 1rem;
}

.panel {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 1.15rem;
}

.order-card {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 1.1rem 1.15rem;
}

.order-card--editing {
  border-color: var(--accent-border);
}

.order-card__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.order-card__title {
  margin: 0;
  font-size: 1.05rem;
}

.order-card__meta {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
}

.status {
  flex-shrink: 0;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  border: 1px solid var(--line);
  background: var(--inset);
}

.status--new {
  color: var(--on-green);
  border-color: var(--accent-border-strong);
  background: linear-gradient(145deg, var(--green-soft), var(--green));
}

.status--paid {
  color: var(--ink);
  border-color: var(--accent-border);
}

.status--shipped {
  color: var(--ink-muted);
}

.order-card__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.order-card__items li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.92rem;
}

.order-card__qty {
  color: var(--ink-muted);
  white-space: nowrap;
}

.order-card__foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--line);
}

.order-card__edit {
  font-size: 0.85rem;
  padding: 0.4rem 0.75rem;
}

.order-edit__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.65rem;
}

.order-edit__row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.65rem;
  align-items: center;
}

.order-edit__name {
  font-size: 0.92rem;
}

.order-edit__sum {
  min-width: 4.5rem;
  text-align: right;
  font-size: 0.88rem;
  color: var(--ink-muted);
}

.order-edit__total {
  margin: 0.85rem 0 0;
}

.order-edit__actions {
  display: flex;
  gap: 0.55rem;
  margin-top: 0.85rem;
}

.error {
  color: var(--danger-text);
  margin: 0 0 1rem;
}

@media (max-width: 560px) {
  .order-edit__row {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .order-edit__sum {
    text-align: left;
  }
}
</style>
