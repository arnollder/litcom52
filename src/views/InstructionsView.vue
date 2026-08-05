<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="container instructions">
    <header class="instructions__head reveal">
      <p class="eyebrow">Перед заказом</p>
      <h1 class="display">Как это работает?</h1>
    </header>

    <ol class="rules reveal reveal-delay-1">
      <li>Вы можете оформить заказ в любое удобное время.</li>
      
      <li>
        Получить заказ можно после объявления в чате от кладовщика.
      </li>
      
    </ol>

    <section class="panel reveal reveal-delay-2">
      <h2 class="display">Выдача</h2>
      <p>
        г. Нижний Новгород, ул. Ванеева, д. 15/34

      </p>
      
        <li>группа «Выбор»</li>
        
     
    </section>

    <section class="notes reveal reveal-delay-3">
      <p>
        В каталоге нет фотографий и описаний товаров — всё это можно посмотреть
        <a href="https://lit-na.ru/" target="_blank" rel="noreferrer">на сайте магазина РЗФ</a>,
        откуда производятся закупки.
      </p>
      <p>
        Для заказа плакатов, сувенирных медалей или других товаров, отсутствующих в каталоге,
        обратитесь лично к кладовщику.
      </p>
      <p>
        Сайт служит только для распространения литературы на нашей местности. Товары продаются
        строго по закупочной цене, без наценки.
      </p>
      <p>
        Подробнее о литкоме —
        <a href="https://аннн.рф/komiteti/litkom" target="_blank" rel="noreferrer">на сайте АН НН</a>.
      </p>
      <p class="thanks">Спасибо!</p>
    </section>

    <div class="actions">
      <RouterLink class="btn btn-primary btn-block" to="/shop">Перейти в каталог</RouterLink>
      <RouterLink class="btn btn-ghost btn-block" to="/">Вернуться на главную</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.instructions {
  padding: 2.5rem 0 1rem;
  max-width: 720px;
}

.instructions__head {
  margin-bottom: 2rem;
}

.eyebrow {
  margin: 0 0 0.6rem;
  color: var(--green);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
  font-weight: 700;
}

.instructions h1 {
  margin: 0;
  font-size: clamp(1.8rem, 4vw, 2.6rem);
}

.rules {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.9rem;
  counter-reset: step;
}

.rules li {
  position: relative;
  padding: 1rem 1rem 1rem 3.4rem;
  border-left: 2px solid var(--line);
  background: linear-gradient(90deg, var(--accent-fill-soft), transparent);
}

.rules li::before {
  counter-increment: step;
  content: counter(step);
  position: absolute;
  left: 1rem;
  top: 1rem;
  font-family: var(--font-display);
  color: var(--green);
  font-size: 0.95rem;
}

.panel {
  margin: 2.2rem 0;
  padding: 1.4rem 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.panel h2 {
  margin: 0 0 0.7rem;
  font-size: 1.3rem;
}

.panel p,
.panel ul {
  margin: 0;
}

.panel ul {
  margin-top: 0.8rem;
  padding-left: 1.1rem;
  color: var(--ink-muted);
}

.notes p {
  color: var(--ink-muted);
}

.thanks {
  color: var(--green-soft) !important;
  font-weight: 700;
}

.actions {
  display: grid;
  gap: 0.7rem;
  margin-top: 2rem;
}
</style>
