<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart'
import QtyControl from '../components/QtyControl.vue'
import { updateCustomerOrder } from '../services/moysklad'
import {
  clearOrderEditSession,
  mergeOrderItems,
  readOrderEditSession,
} from '../utils/order-edit-session.js'

const POLL_MS = 60_000

const cart = useCartStore()
const router = useRouter()
const query = ref('')
const editSession = ref(readOrderEditSession())
const isAppending = ref(false)
const appendError = ref('')
const openCategories = ref(
  Object.fromEntries(cart.catalog.categories.map((c) => [c.category, false])),
)
const setsOpen = ref(true)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return cart.catalog.categories
    .map((cat) => ({
      ...cat,
      products: cat.products.filter(
        (p) => p.stock > 0 && (!q || p.name.toLowerCase().includes(q)),
      ),
    }))
    .filter((cat) => cat.products.length)
})

const stockHint = computed(() => {
  if (editSession.value) {
    const label = editSession.value.orderName
      ? `№${editSession.value.orderName}`
      : editSession.value.orderId.slice(0, 8)
    return `Дополняем заказ ${label} — добавьте позиции в корзину и нажмите «Добавить к заказу».`
  }
  if (cart.stockStatus.loading) return 'Обновляем остатки из МойСклад…'
  if (cart.stockStatus.error) return `Остатки из файла (live недоступен): ${cart.stockStatus.error}`
  if (cart.stockStatus.live && cart.stockStatus.updatedAt) {
    const time = new Date(cart.stockStatus.updatedAt).toLocaleTimeString('ru-RU')
    return `Остатки live из МойСклад · обновлено ${time}`
  }
  return 'Остатки из последней выгрузки. Запустите npm run dev для live-обновления.'
})

function lineSum(product) {
  const qty = cart.getQty(product.id)
  return qty > 0 ? `${qty} (${(qty * product.price).toLocaleString('ru-RU')} ₽)` : '—'
}

function formatPrice(price) {
  return `${price.toLocaleString('ru-RU')} ₽`
}

async function refreshStockQuiet() {
  try {
    await cart.refreshStock()
  } catch {
    // Keep static catalog fallback; error shown via stockStatus.
  }
}

function cancelAppendMode() {
  clearOrderEditSession()
  editSession.value = null
  router.push('/orders')
}

async function appendCartToOrder() {
  if (!editSession.value || isAppending.value) return
  if (!cart.count) {
    appendError.value = 'Сначала добавьте позиции в корзину'
    return
  }

  isAppending.value = true
  appendError.value = ''
  try {
    const items = mergeOrderItems(
      editSession.value.items,
      cart.lines.map((line) => ({
        id: line.id,
        name: line.name,
        price: line.price,
        qty: line.qty,
      })),
    )
    await updateCustomerOrder(editSession.value.orderId, {
      counterpartyId: editSession.value.counterpartyId,
      items,
    })
    clearOrderEditSession()
    editSession.value = null
    cart.clear()
    router.push('/orders')
  } catch (error) {
    appendError.value =
      error instanceof Error ? error.message : 'Не удалось обновить заказ'
  } finally {
    isAppending.value = false
  }
}

let pollTimer = null

onMounted(() => {
  refreshStockQuiet()
  pollTimer = window.setInterval(refreshStockQuiet, POLL_MS)
})

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})
</script>

<template>
  <div class="container shop" :class="{ 'shop--append': editSession }">
    <div v-if="editSession" class="append-bar reveal">
      <p class="append-bar__text">
        Дополнение заказа
        <strong>{{ editSession.orderName ? `№${editSession.orderName}` : '' }}</strong>
        — в корзине {{ cart.count }} поз.
      </p>
      <div class="append-bar__actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="isAppending || !cart.count"
          @click="appendCartToOrder"
        >
          {{ isAppending ? 'Сохранение…' : 'Добавить к заказу' }}
        </button>
        <button type="button" class="btn btn-ghost" :disabled="isAppending" @click="cancelAppendMode">
          К заказам
        </button>
      </div>
      <p v-if="appendError" class="append-bar__error">{{ appendError }}</p>
    </div>

    <header class="shop__head reveal">
      <div>
        <p class="eyebrow">Витрина</p>
        <h1 class="display">Каталог литературы</h1>
        <p class="muted">
          {{ stockHint }}
        </p>
        <p class="muted shop__meta">
          Описания и фото —
          <a href="https://lit-na.ru/" target="_blank" rel="noreferrer">lit-na.ru</a>
        </p>
      </div>
      <div class="shop__tools">
        <button
          class="btn btn-ghost"
          type="button"
          :disabled="cart.stockStatus.loading"
          @click="refreshStockQuiet"
        >
          {{ cart.stockStatus.loading ? 'Обновляем…' : 'Обновить остатки' }}
        </button>
        <label class="search">
          <span class="sr-only">Поиск</span>
          <input v-model="query" type="search" placeholder="Найти позицию…" />
        </label>
      </div>
    </header>

    <!-- Стартовый набор временно скрыли -->
    <!-- <details class="set" :open="setsOpen" @toggle="setsOpen = $event.target.open">
      <summary>Наборы</summary>
      <div class="set__body">
        <h2 class="display">{{ cart.catalog.starterSet.title }}</h2>
        <p class="muted">{{ cart.catalog.starterSet.description }}</p>
        <p class="set__note">{{ cart.catalog.starterSet.note }}</p>
        <button class="btn btn-primary" type="button" @click="cart.addStarterSet()">
          Добавить в корзину
        </button>
      </div>
    </details> -->

    <section
      v-for="category in filtered"
      :key="category.category"
      class="category"
    >
      <details
        :open="openCategories[category.category]"
        @toggle="openCategories[category.category] = $event.target.open"
      >
        <summary>
          <span>{{ category.category }}</span>
          <span class="category__count">{{ category.products.length }}</span>
        </summary>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Название</th>
                <th>Цена</th>
                <th>В наличии</th>
                <th>В заказе</th>
                <th>Кол-во</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="product in category.products"
                :key="product.id"
                :class="{ 'is-active': cart.getQty(product.id) > 0 }"
              >
                <td data-label="Название">{{ product.name }}</td>
                <td data-label="Цена">{{ formatPrice(product.price) }}</td>
                <td data-label="В наличии">{{ product.stock }}</td>
                <td data-label="В заказе">{{ lineSum(product) }}</td>
                <td data-label="Кол-во">
                  <QtyControl
                    :model-value="cart.getQty(product.id)"
                    :max="product.stock"
                    @update:model-value="cart.setQty(product.id, $event)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </section>

    <p v-if="!filtered.length" class="empty muted">Ничего не найдено по запросу.</p>

    <p class="back">
      <RouterLink to="/">Вернуться на главную</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.shop {
  padding: 2.2rem 0 6rem;
}

.shop__head {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  align-items: end;
  flex-wrap: wrap;
  margin-bottom: 1.8rem;
}

.eyebrow {
  margin: 0 0 0.45rem;
  color: var(--green);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
  font-weight: 700;
}

.shop__head h1 {
  margin: 0 0 0.45rem;
  font-size: clamp(1.7rem, 4vw, 2.4rem);
}

.shop__head p {
  margin: 0;
  max-width: 36rem;
}

.shop__meta {
  margin-top: 0.35rem !important;
}

.shop__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.search input {
  width: min(280px, 100%);
  padding: 0.85rem 1rem;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--inset);
  color: var(--ink);
}

.search input:focus {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

.set,
.category {
  margin-bottom: 0.9rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
}

.set summary,
.category summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.15rem;
  font-family: var(--font-display);
  font-size: 1.05rem;
}

.set summary::-webkit-details-marker,
.category summary::-webkit-details-marker {
  display: none;
}

.category__count {
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--ink-muted);
  font-weight: 600;
}

.set__body {
  padding: 0 1.15rem 1.25rem;
  border-top: 1px solid var(--line);
}

.set__body h2 {
  margin: 1rem 0 0.5rem;
  font-size: 1.15rem;
}

.set__note {
  color: var(--ink-muted);
  font-size: 0.92rem;
}

.table-wrap {
  overflow-x: auto;
  border-top: 1px solid var(--line);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 680px;
}

th,
td {
  padding: 0.85rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--line-faint);
  vertical-align: middle;
}

th {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  background: var(--inset-soft);
}

td:nth-child(2),
td:nth-child(3),
td:nth-child(4),
th:nth-child(2),
th:nth-child(3),
th:nth-child(4),
th:nth-child(5) {
  text-align: center;
  white-space: nowrap;
}

tr.is-active {
  background: var(--accent-fill-soft);
}

.empty,
.back {
  text-align: center;
  margin-top: 1.5rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

@media (max-width: 720px) {
  table {
    min-width: 0;
  }

  thead {
    display: none;
  }

  tr {
    display: grid;
    gap: 0.45rem;
    padding: 1rem;
    border-bottom: 1px solid var(--line);
  }

  td {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0;
    border: 0;
    text-align: right !important;
    white-space: normal;
  }

  td::before {
    content: attr(data-label);
    color: var(--ink-muted);
    font-size: 0.8rem;
    text-align: left;
  }

  td:first-child {
    display: block;
    text-align: left !important;
    font-weight: 700;
  }

  td:first-child::before {
    display: none;
  }
}

.shop--append {
  padding-bottom: 5rem;
}

.append-bar {
  position: sticky;
  top: var(--header-h);
  z-index: 40;
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius);
  background: var(--surface-strong);
  box-shadow: var(--shadow);
  display: grid;
  gap: 0.55rem;
}

.append-bar__text {
  margin: 0;
  font-size: 0.92rem;
}

.append-bar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.append-bar__error {
  margin: 0;
  color: var(--danger-text);
  font-size: 0.85rem;
}
</style>
