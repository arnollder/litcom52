<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import QtyControl from '../components/QtyControl.vue'
import { useCartStore } from '../stores/cart'
import { fetchCounterpartiesFromMoySklad, reserveOrderInMoySklad } from '../services/moysklad'

const cart = useCartStore()
const router = useRouter()
const submitted = ref(false)
const isSubmitting = ref(false)
const submitError = ref('')
const reservedOrder = ref(null)

const counterparties = ref([])
const isCounterpartiesLoading = ref(false)
const counterpartiesError = ref('')
const counterpartiesWarning = ref('')
const selectedCounterpartyId = ref('')
const counterpartiesDropdownOpen = ref(false)

const selectedCounterparty = computed(
  () => counterparties.value.find((item) => item.id === selectedCounterpartyId.value) || null,
)

const canSubmit = computed(
  () => cart.count > 0 && selectedCounterparty.value && !isSubmitting.value,
)

async function submit() {
  if (!canSubmit.value) return

  isSubmitting.value = true
  submitError.value = ''

  const orderSnapshot = {
    createdAt: new Date().toISOString(),
    customer: {
      contact: selectedCounterparty.value?.contact || '',
      counterparty: selectedCounterparty.value
        ? {
            id: selectedCounterparty.value.id,
            name: selectedCounterparty.value.name,
          }
        : null,
    },
    items: cart.lines.map((line) => ({ ...line })),
    total: cart.total,
  }

  try {
    const moySkladOrder = await reserveOrderInMoySklad({
      counterpartyId: selectedCounterparty.value.id,
      counterpartyName: selectedCounterparty.value.name,
      items: orderSnapshot.items,
      customer: orderSnapshot.customer,
      total: orderSnapshot.total,
      createdAt: orderSnapshot.createdAt,
    })

    reservedOrder.value = moySkladOrder
    const order = {
      ...orderSnapshot,
      moySklad: moySkladOrder,
    }
    localStorage.setItem('litcom52-last-order', JSON.stringify(order))
    cart.clear()
    submitted.value = true
    try {
      await cart.refreshStock()
    } catch {
      // Stock refresh is best-effort after successful reserve.
    }
  } catch (error) {
    submitError.value =
      error instanceof Error ? error.message : 'Не удалось зарезервировать заказ в МойСклад.'
  } finally {
    isSubmitting.value = false
  }
}

function backToShop() {
  router.push('/shop')
}

function removeLine(id) {
  cart.setQty(id, 0)
}

function selectCounterparty(id) {
  selectedCounterpartyId.value = id
  counterpartiesDropdownOpen.value = false
}

async function loadCounterparties() {
  isCounterpartiesLoading.value = true
  counterpartiesError.value = ''
  counterpartiesWarning.value = ''
  try {
    const { rows, warning } = await fetchCounterpartiesFromMoySklad()
    counterparties.value = rows
    counterpartiesWarning.value = warning
  } catch (error) {
    counterpartiesError.value = error instanceof Error ? error.message : 'Не удалось загрузить контрагентов.'
  } finally {
    isCounterpartiesLoading.value = false
  }
}

onMounted(loadCounterparties)
</script>

<template>
  <div class="container checkout">
    <template v-if="submitted">
      <div class="success reveal">
        <p class="eyebrow">Готово</p>
        <h1 class="display">Заказ зарезервирован в МойСклад</h1>
        <p class="muted">
          Позиции заказа поставлены в резерв. Ожидайте подтверждения и реквизитов в чате
          литкома.
        </p>
        <p v-if="reservedOrder?.name" class="hint muted">
          Документ: {{ reservedOrder.name }}
          <template v-if="reservedOrder.id"> · id {{ reservedOrder.id }}</template>
        </p>
        <div class="actions">
          <RouterLink class="btn btn-primary" to="/shop">Вернуться в каталог</RouterLink>
          <RouterLink class="btn btn-ghost" to="/">На главную</RouterLink>
        </div>
      </div>
    </template>

    <template v-else-if="!cart.count">
      <div class="empty reveal">
        <h1 class="display">Корзина пуста</h1>
        <p class="muted">Добавьте позиции в каталоге, затем оформите заказ.</p>
        <button class="btn btn-primary" type="button" @click="backToShop">В каталог</button>
      </div>
    </template>

    <template v-else>
      <header class="checkout__head reveal">
        <p class="eyebrow">Оформление</p>
        <h1 class="display">Ваш заказ</h1>
      </header>

      <div class="layout">
        <section class="panel reveal">
          <h2>Состав</h2>
          <ul class="lines">
            <li v-for="line in cart.lines" :key="line.id">
              <div class="line__main">
                <strong>{{ line.name }}</strong>
                <span class="muted">{{ line.price.toLocaleString('ru-RU') }} ₽ / шт</span>
                <div class="line__controls">
                  <QtyControl
                    :model-value="line.qty"
                    :max="line.stock"
                    @update:model-value="cart.setQty(line.id, $event)"
                  />
                  <button
                    class="line__remove"
                    type="button"
                    :aria-label="`Удалить ${line.name}`"
                    @click="removeLine(line.id)"
                  >
                    Удалить
                  </button>
                </div>
              </div>
              <span class="line__sum">{{ line.sum.toLocaleString('ru-RU') }} ₽</span>
            </li>
          </ul>
          <div class="total">
            <span>Итого</span>
            <strong>{{ cart.total.toLocaleString('ru-RU') }} ₽</strong>
          </div>
        </section>

        <form class="panel reveal reveal-delay-1" @submit.prevent="submit">
          <h2>Контакты</h2>
          <div class="counterparty-group">
            <details
              class="counterparty-dropdown"
              :open="counterpartiesDropdownOpen"
              @toggle="counterpartiesDropdownOpen = $event.target.open"
            >
              <summary>
                {{ selectedCounterparty ? selectedCounterparty.name : 'Выберите контрагента' }}
              </summary>
              <div class="counterparty-list">
                <p v-if="isCounterpartiesLoading" class="hint muted">Загружаем контрагентов...</p>
                <p v-else-if="counterpartiesError" class="hint error">{{ counterpartiesError }}</p>
                <p v-else-if="counterpartiesWarning" class="hint muted">{{ counterpartiesWarning }}</p>
                <p v-else-if="!counterparties.length" class="hint muted">Список контрагентов пуст.</p>
                <label
                  v-for="counterparty in counterparties"
                  :key="counterparty.id"
                  class="counterparty-option"
                >
                  <input
                    type="radio"
                    name="counterparty"
                    :value="counterparty.id"
                    :checked="counterparty.id === selectedCounterpartyId"
                    @change="selectCounterparty(counterparty.id)"
                  />
                  <span>
                    <strong>{{ counterparty.name }}</strong>
                    <small class="muted">{{ counterparty.description || 'Контакт не указан' }}</small>
                  </span>
                </label>
              </div>
            </details>
            <p v-if="selectedCounterparty?.contact" class="hint muted">
              Контакт: {{ selectedCounterparty.contact }}
            </p>
            <p v-else-if="selectedCounterparty" class="hint muted">
              У выбранного контрагента не заполнен контакт (телефон/email).
            </p>
          </div>
          <button class="btn btn-primary btn-block" type="submit" :disabled="!canSubmit">
            {{ isSubmitting ? 'Резервируем…' : 'Отправить заказ' }}
          </button>
          <p v-if="submitError" class="hint error">{{ submitError }}</p>
          <p class="hint muted">
            При отправке позиции резервируются в МойСклад. Подтверждение и реквизиты — в чате
            литкома.
          </p>
        </form>
      </div>
    </template>
  </div>
</template>

<style scoped>
.checkout {
  padding: 2.2rem 0 3rem;
  max-width: 960px;
}

.eyebrow {
  margin: 0 0 0.45rem;
  color: var(--green);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
  font-weight: 700;
}

.checkout__head h1,
.success h1,
.empty h1 {
  margin: 0 0 0.7rem;
  font-size: clamp(1.7rem, 4vw, 2.4rem);
}

.layout {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 1rem;
}

.panel {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 1.2rem;
}

.panel h2 {
  margin: 0 0 1rem;
  font-size: 1.05rem;
}

.lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.85rem;
}

.lines li {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid var(--line-faint);
}

.line__main {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
  flex: 1;
}

.lines strong {
  display: block;
}

.lines span.muted {
  display: block;
  font-size: 0.88rem;
}

.line__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  margin-top: 0.15rem;
}

.line__remove {
  border: 0;
  background: transparent;
  color: var(--danger-text);
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  padding: 0.2rem 0.1rem;
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

.line__remove:hover {
  opacity: 0.8;
}

.line__sum {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  padding-top: 0.15rem;
}

.total {
  margin-top: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--font-display);
  font-size: 1.15rem;
}

form {
  display: grid;
  gap: 0.85rem;
}

label {
  display: grid;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: var(--ink-muted);
}

input,
textarea {
  width: 100%;
  padding: 0.8rem 0.9rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--inset);
  color: var(--ink);
  resize: vertical;
}

input:focus,
textarea:focus {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.hint {
  margin: 0;
  font-size: 0.88rem;
}

.error {
  color: var(--danger-text);
}

.counterparty-dropdown {
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--inset-soft);
}

.counterparty-dropdown summary {
  cursor: pointer;
  list-style: none;
  padding: 0.8rem 0.9rem;
}

.counterparty-dropdown summary::-webkit-details-marker {
  display: none;
}

.counterparty-list {
  border-top: 1px solid var(--line);
  max-height: 260px;
  overflow: auto;
  padding: 0.5rem;
  display: grid;
  gap: 0.45rem;
}

.counterparty-option {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  border: 1px solid var(--accent-border-faint);
  border-radius: 10px;
  padding: 0.55rem 0.65rem;
}

.counterparty-option input {
  width: auto;
  margin-top: 0.18rem;
}

.counterparty-option strong {
  display: block;
}

.counterparty-option small {
  display: block;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 1.4rem;
}

.empty,
.success {
  max-width: 34rem;
}

@media (max-width: 820px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
