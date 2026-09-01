<script setup>
import { ref } from 'vue'
import {
  PAYMENT_METHOD,
  PAYMENT_PHONE,
  PAYMENT_PHONE_LABEL,
  PAYMENT_RECIPIENT,
} from '../utils/payment.js'

defineProps({
  amount: {
    type: Number,
    default: null,
  },
  title: {
    type: String,
    default: 'Реквизиты для оплаты',
  },
  compact: {
    type: Boolean,
    default: false,
  },
})

const phoneCopied = ref(false)

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
</script>

<template>
  <div class="payment" :class="{ 'payment--compact': compact }">
    <h2>{{ title }}</h2>
    <p v-if="compact" class="payment__hint muted">
      Оплатите заказ и напишите в чат литкома после перевода.
    </p>
    <dl class="payment__details">
      <div>
        <dt>Способ</dt>
        <dd>{{ PAYMENT_METHOD }}</dd>
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
        <dd>{{ PAYMENT_RECIPIENT }}</dd>
      </div>
      <div v-if="amount != null && amount > 0">
        <dt>Сумма</dt>
        <dd>{{ amount.toLocaleString('ru-RU') }}&nbsp;₽</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.payment {
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--inset-soft);
}

.payment--compact {
  margin-top: 0.85rem;
  padding: 0.85rem 0.95rem;
}

.payment h2 {
  margin: 0 0 0.85rem;
  font-size: 1.05rem;
}

.payment--compact h2 {
  margin-bottom: 0.45rem;
  font-size: 0.95rem;
}

.payment__hint {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
}

.payment__details {
  margin: 0;
  display: grid;
  gap: 0.7rem;
}

.payment--compact .payment__details {
  gap: 0.55rem;
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

.payment--compact .payment__details dt {
  font-size: 0.82rem;
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

.payment--compact .payment__details dd {
  font-size: 0.92rem;
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
</style>
