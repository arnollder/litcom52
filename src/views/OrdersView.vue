<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import CounterpartySelect from '../components/CounterpartySelect.vue'
import PaymentDetails from '../components/PaymentDetails.vue'
import QtyControl from '../components/QtyControl.vue'
import { useCartStore } from '../stores/cart'
import { fetchCustomerOrders, fetchLiveStock, updateCustomerOrder } from '../services/moysklad'
import { getSavedCounterparty } from '../utils/counterparty.js'
import {
  clearOrderEditSession,
  readOrderEditSession,
  saveOrderEditSession,
} from '../utils/order-edit-session.js'

const router = useRouter()
const cart = useCartStore()

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
const editBaseItemIds = ref(new Set())
const catalogQuery = ref('')

const hasCounterparty = computed(() => Boolean(counterparty.value?.id))

const catalogMatches = computed(() => {
  const q = catalogQuery.value.trim().toLowerCase()
  if (q.length < 2) return []
  const results = []
  for (const category of cart.catalog.categories) {
    for (const product of category.products) {
      if (product.stock <= 0) continue
      if (!product.name.toLowerCase().includes(q)) continue
      results.push(product)
      if (results.length >= 10) return results
    }
  }
  return results
})

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
  const free = Number(stockById.value[id]) ?? productStock(id)
  const current = Number(item.qty) || 0
  if (editBaseItemIds.value.has(id)) {
    return Math.max(current, free + current, 99)
  }
  return Math.max(free, current, 1)
}

function productStock(id) {
  return cart.productIndex.get(String(id))?.stock ?? 0
}

function mergeIntoDraft(product, qty = 1) {
  const id = String(product.id)
  const add = Math.max(1, Math.floor(Number(qty) || 1))
  const existing = draftItems.value.find((row) => String(row.id) === id)
  if (existing) {
    existing.qty = Math.min(maxQtyForItem(existing), existing.qty + add)
    return
  }
  const max = Math.max(productStock(id), 1)
  draftItems.value.push({
    id: product.id,
    name: product.name,
    price: product.price,
    qty: Math.min(add, max),
  })
}

function addFromCatalog(product) {
  mergeIntoDraft(product, 1)
  catalogQuery.value = ''
}

function isEditingOrder(order) {
  return editingId.value === order.id && order.canEdit
}

function resumeEditIfNeeded() {
  const session = readOrderEditSession()
  if (!session || editingId.value || counterparty.value?.id !== session.counterpartyId) return
  const order = orders.value.find((row) => row.id === session.orderId)
  if (!order?.canEdit) {
    clearOrderEditSession()
    return
  }
  editingId.value = order.id
  editBaseItemIds.value = new Set(order.items.map((item) => String(item.id)))
  draftItems.value = session.items.map((item) => ({ ...item }))
  fetchLiveStock()
    .then((stock) => {
      stockById.value = stock.stockById || {}
      cart.applyStockMap(stock.stockById || {})
    })
    .catch(() => {
      stockById.value = {}
    })
}

function openCatalog(order) {
  if (!counterparty.value?.id) return
  cart.clear()
  saveOrderEditSession({
    orderId: order.id,
    orderName: order.moySklad?.name || '',
    counterpartyId: counterparty.value.id,
    items: draftItems.value.filter((item) => Number(item.qty) > 0),
  })
  router.push('/shop')
}

function restoreEditSession(order) {
  const session = readOrderEditSession()
  if (!session || session.orderId !== order.id) return false
  draftItems.value = session.items.map((item) => ({ ...item }))
  clearOrderEditSession()
  return true
}

watch(
  () => counterparty.value?.id,
  (id, prev) => {
    if (id === prev) return
    cancelEdit()
    if (id) loadOrders()
    else orders.value = []
  },
  { immediate: true },
)

async function loadOrders() {
  if (!counterparty.value?.id) return
  isLoading.value = true
  error.value = ''
  try {
    const result = await fetchCustomerOrders(counterparty.value.id)
    orders.value = result.orders
    if (editingId.value) {
      const current = orders.value.find((row) => row.id === editingId.value)
      if (!current?.canEdit) cancelEdit()
    }
    resumeEditIfNeeded()
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
  catalogQuery.value = ''
  editBaseItemIds.value = new Set(order.items.map((item) => String(item.id)))
  if (!restoreEditSession(order)) {
    draftItems.value = order.items.map((item) => ({ ...item }))
  }
  try {
    const stock = await fetchLiveStock()
    stockById.value = stock.stockById || {}
    cart.applyStockMap(stock.stockById || {})
  } catch {
    stockById.value = {}
  }
}

function cancelEdit() {
  const orderId = editingId.value
  editingId.value = ''
  draftItems.value = []
  saveError.value = ''
  catalogQuery.value = ''
  editBaseItemIds.value = new Set()
  const session = readOrderEditSession()
  if (session?.orderId === orderId) clearOrderEditSession()
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
    clearOrderEditSession()
    cancelEdit()
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Не удалось сохранить'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="container orders">
    <header class="orders__head reveal">
      <div>
        <p class="eyebrow">Личный кабинет</p>
        <h1 class="display">Мои заказы</h1>
        <p class="muted">Выберите контрагента — покажем историю его заказов.</p>
      </div>
      <button
        v-if="hasCounterparty"
        type="button"
        class="btn btn-ghost"
        :disabled="isLoading"
        @click="loadOrders"
      >
        {{ isLoading ? 'Обновление…' : 'Обновить' }}
      </button>
    </header>

    <section class="panel reveal orders__picker">
      <CounterpartySelect
        v-model="counterparty"
        :persist="false"
        input-name="orders-counterparty"
        label="Контрагент"
      />
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="hasCounterparty && isLoading && !orders.length" class="panel reveal muted">
      Загружаем заказы…
    </section>

    <section v-else-if="hasCounterparty && !orders.length" class="panel reveal">
      <p class="muted">Заказов пока нет.</p>
      <RouterLink class="btn btn-primary" to="/shop">Перейти в каталог</RouterLink>
    </section>

    <div v-else-if="hasCounterparty" class="orders__list">
      <article
        v-for="order in orders"
        :key="order.id"
        class="order-card reveal"
        :class="{ 'order-card--editing': isEditingOrder(order) }"
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

        <template v-if="isEditingOrder(order)">
          <div class="order-edit">
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

            <div class="order-edit__add">
              <p class="order-edit__add-title">Добавить из каталога</p>
              <label class="order-edit__search">
                <span class="muted">Поиск</span>
                <input
                  v-model="catalogQuery"
                  type="search"
                  placeholder="Название позиции…"
                  autocomplete="off"
                />
              </label>
              <div v-if="catalogMatches.length" class="order-edit__matches">
                <div v-for="product in catalogMatches" :key="product.id" class="order-edit__match">
                  <span>
                    <strong>{{ product.name }}</strong>
                    <small class="muted">{{ formatMoney(product.price) }} · в наличии {{ product.stock }}</small>
                  </span>
                  <button type="button" class="btn btn-ghost order-edit__pick" @click="addFromCatalog(product)">
                    Добавить
                  </button>
                </div>
              </div>
              <p v-else-if="catalogQuery.trim().length >= 2" class="hint muted">Ничего не найдено.</p>
              <button type="button" class="btn btn-ghost order-edit__catalog" @click="openCatalog(order)">
                Открыть полный каталог
              </button>
            </div>

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
        </template>

        <template v-else>
          <ul class="order-card__items">
            <li v-for="item in order.items" :key="item.id">
              <span>{{ item.name }}</span>
              <span class="order-card__qty">{{ item.qty }} × {{ formatMoney(item.price) }}</span>
            </li>
          </ul>

          <PaymentDetails
            v-if="order.status === 'new'"
            compact
            :amount="order.total"
          />
        </template>

        <footer v-if="!isEditingOrder(order)" class="order-card__foot">
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

.orders__picker {
  margin-bottom: 1rem;
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
  flex-wrap: wrap;
}

.order-edit__add {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed var(--line);
  display: grid;
  gap: 0.65rem;
}

.order-edit__add-title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
}

.order-edit__search {
  display: grid;
  gap: 0.35rem;
}

.order-edit__search input {
  width: 100%;
  padding: 0.75rem 0.85rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--inset);
  color: var(--ink);
}

.order-edit__matches {
  display: grid;
  gap: 0.45rem;
  max-height: 200px;
  overflow: auto;
}

.order-edit__match {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--inset-soft);
}

.order-edit__match strong {
  display: block;
  font-size: 0.9rem;
}

.order-edit__match small {
  display: block;
  font-size: 0.78rem;
}

.order-edit__pick {
  flex-shrink: 0;
  font-size: 0.82rem;
  padding: 0.35rem 0.65rem;
}

.order-edit__catalog {
  justify-self: start;
  font-size: 0.85rem;
}

.hint {
  margin: 0;
  font-size: 0.88rem;
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
