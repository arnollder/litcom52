<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import QtyControl from '../components/QtyControl.vue'
import PushNotifyButton from '../components/PushNotifyButton.vue'
import { useCartStore } from '../stores/cart'
import { fetchCounterpartiesFromMoySklad, reserveOrderInMoySklad } from '../services/moysklad'
import { getSavedCounterparty, saveCounterparty } from '../utils/counterparty.js'

const cart = useCartStore()
const router = useRouter()
const submitted = ref(false)
const isSubmitting = ref(false)
const submitError = ref('')
const reservedOrder = ref(null)
const submittedTotal = ref(0)
const phoneCopied = ref(false)

const PAYMENT_PHONE = '+79063535039'
const PAYMENT_PHONE_LABEL = '+7\u00a0906\u00a0353‑50‑39'

async function copyPaymentPhone() {
  try {
    await navigator.clipboard.writeText(PAYMENT_PHONE)
  } catch {
    const input = document.createElement('input')
    input.value = PAYMENT_PHONE
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    input.remove()
  }
  phoneCopied.value = true
  window.clearTimeout(copyPaymentPhone._t)
  copyPaymentPhone._t = window.setTimeout(() => {
    phoneCopied.value = false
  }, 2000)
}

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
    submittedTotal.value = orderSnapshot.total
    saveCounterparty({
      id: selectedCounterparty.value.id,
      name: selectedCounterparty.value.name,
    })
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
  const row = counterparties.value.find((item) => item.id === id)
  if (row) saveCounterparty({ id: row.id, name: row.name })
}

async function loadCounterparties() {
  isCounterpartiesLoading.value = true
  counterpartiesError.value = ''
  counterpartiesWarning.value = ''
  try {
    const { rows, warning } = await fetchCounterpartiesFromMoySklad()
    counterparties.value = rows
    counterpartiesWarning.value = warning
    const saved = getSavedCounterparty()
    if (saved && rows.some((row) => row.id === saved.id)) {
      selectedCounterpartyId.value = saved.id
    }
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
        <h1 class="display">Заказ зарезервирован</h1>
        <p class="muted">
          Позиции поставлены в резерв. Оплатите заказ по реквизитам ниже и напишите в чат
          литкома после перевода.
        </p>
        <p v-if="reservedOrder?.name" class="hint muted">
          Документ: {{ reservedOrder.name }}
          <template v-if="reservedOrder.id"> · id {{ reservedOrder.id }}</template>
        </p>

        <div class="payment">
          <h2>Реквизиты для оплаты</h2>
          <dl class="payment__details">
            <div>
              <dt>Способ</dt>
              <dd>СБП · ЮMoney</dd>
            </div>
            <div>
              <dt>Телефон</dt>
              <dd>
                <button
                  class="payment__phone"
                  type="button"
                  :title="phoneCopied ? 'Скопировано' : 'Скопировать номер'"
                  @click="copyPaymentPhone"
                >
                  {{ PAYMENT_PHONE_LABEL }}
                </button>
                <span v-if="phoneCopied" class="payment__copied">Скопировано</span>
              </dd>
            </div>
            <div>
              <dt>Получатель</dt>
              <dd>Евгений&nbsp;Т.</dd>
            </div>
            <div v-if="submittedTotal > 0">
              <dt>Сумма</dt>
              <dd>{{ submittedTotal.toLocaleString('ru-RU') }}&nbsp;₽</dd>
            </div>
          </dl>
        </div>

        <PushNotifyButton variant="panel" />

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
              </div>
              <div class="line__aside">
                <span class="line__sum">{{ line.sum.toLocaleString('ru-RU') }} ₽</span>
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
                    :title="`Удалить ${line.name}`"
                    @click="removeLine(line.id)"
                  >
                    <svg class="line__remove-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M9 3a1 1 0 0 0-1 1v1H5a1 1 0 1 0 0 2h1v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7h1a1 1 0 1 0 0-2h-3V4a1 1 0 0 0-1-1H9Zm1 2h4v1h-4V5Zm-1 4a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Zm4 0a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Zm4 0a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
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
            <PushNotifyButton v-if="selectedCounterparty" variant="inline" />
          </div>
          <button class="btn btn-primary btn-block" type="submit" :disabled="!canSubmit">
            {{ isSubmitting ? 'Резервируем…' : 'Отправить заказ' }}
          </button>
          <p v-if="submitError" class="hint error">{{ submitError }}</p>
          <p class="hint muted">
            При отправке позиции резервируются в МойСклад. После оформления покажем реквизиты
            для оплаты.
          </p>
        </form>
      </div>
    </template>
  </div>
</template>

<style scoped>
.checkout {
  padding: 2.2rem 0 3rem;
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
  grid-template-columns: minmax(0, 1.7fr) minmax(260px, 0.75fr);
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
  align-items: center;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lines span.muted {
  display: block;
  font-size: 0.88rem;
}

.line__aside {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.line__controls {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.line__remove {
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--danger-text);
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;
}

.line__remove:hover {
  background: var(--nav-hover);
  opacity: 0.9;
}

.line__remove-icon {
  width: 1.05rem;
  height: 1.05rem;
}

.line__sum {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  min-width: 5.5rem;
  text-align: right;
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

.payment {
  margin-top: 1.25rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.payment h2 {
  margin: 0 0 0.85rem;
  font-size: 1.05rem;
}

.payment__details {
  margin: 0;
  display: grid;
  gap: 0.7rem;
}

.payment__details > div {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  gap: 0.6rem;
  align-items: baseline;
}

.payment__details dt {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.88rem;
}

.payment__details dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}

.payment__phone {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  border-bottom: 1px solid var(--line);
}

.payment__phone:hover {
  color: var(--green);
  border-bottom-color: var(--green);
}

.payment__copied {
  color: var(--green);
  font-size: 0.85rem;
  font-weight: 500;
}

@media (max-width: 820px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .lines li {
    flex-wrap: wrap;
  }

  .line__aside {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
