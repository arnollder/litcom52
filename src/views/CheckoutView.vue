<script setup>
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart'

const cart = useCartStore()
const router = useRouter()
const submitted = ref(false)

const form = reactive({
  name: '',
  contact: '',
  group: '',
  comment: '',
})

const canSubmit = computed(
  () => cart.count > 0 && form.name.trim() && form.contact.trim(),
)

function submit() {
  if (!canSubmit.value) return
  const order = {
    createdAt: new Date().toISOString(),
    customer: { ...form },
    items: cart.lines,
    total: cart.total,
  }
  localStorage.setItem('litcom52-last-order', JSON.stringify(order))
  cart.clear()
  submitted.value = true
}

function backToShop() {
  router.push('/shop')
}
</script>

<template>
  <div class="container checkout">
    <template v-if="submitted">
      <div class="success reveal">
        <p class="eyebrow">Готово</p>
        <h1 class="display">Заказ сохранён локально</h1>
        <p class="muted">
          Это фронтенд-демо: данные записаны в браузер. В боевой версии заказ уйдёт
          оператору литкома. Ожидайте подтверждения во второй или четвёртый вторник.
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
              <div>
                <strong>{{ line.name }}</strong>
                <span class="muted">{{ line.qty }} × {{ line.price.toLocaleString('ru-RU') }} ₽</span>
              </div>
              <span>{{ line.sum.toLocaleString('ru-RU') }} ₽</span>
            </li>
          </ul>
          <div class="total">
            <span>Итого</span>
            <strong>{{ cart.total.toLocaleString('ru-RU') }} ₽</strong>
          </div>
        </section>

        <form class="panel reveal reveal-delay-1" @submit.prevent="submit">
          <h2>Контакты</h2>
          <label>
            Имя / ник в чате
            <input v-model="form.name" required autocomplete="name" />
          </label>
          <label>
            Telegram или телефон
            <input v-model="form.contact" required autocomplete="tel" />
          </label>
          <label>
            Группа (необязательно)
            <input v-model="form.group" />
          </label>
          <label>
            Комментарий
            <textarea v-model="form.comment" rows="3" />
          </label>
          <button class="btn btn-primary btn-block" type="submit" :disabled="!canSubmit">
            Отправить заказ
          </button>
          <p class="hint muted">
            Подтверждение и реквизиты — в чате литкома после обработки оператором.
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
  background: rgba(11, 21, 16, 0.72);
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
  gap: 1rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid rgba(62, 207, 142, 0.1);
}

.lines strong {
  display: block;
}

.lines span.muted {
  display: block;
  font-size: 0.88rem;
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
  background: rgba(0, 0, 0, 0.28);
  color: var(--ink);
  resize: vertical;
}

input:focus,
textarea:focus {
  outline: 2px solid rgba(62, 207, 142, 0.35);
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
