<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="hero">
    <div class="hero__visual" aria-hidden="true">
      <div class="hero__grid" />
      <div class="hero__book hero__book--a" />
      <div class="hero__book hero__book--b" />
      <div class="hero__book hero__book--c" />
      <div class="hero__leaf" />
    </div>

    <div class="container hero__content">
      <p class="hero__brand display reveal">ЛИТКОМ-М52</p>
      <h1 class="hero__title display reveal reveal-delay-1">
        Магазинчик литературы сообщества
      </h1>
      <p class="hero__lead muted reveal reveal-delay-2">
        Заказ литературы Сообщества АН М52  для
        групп.
      </p>
      <div class="hero__cta reveal reveal-delay-3">
        <RouterLink class="btn btn-primary" to="/shop">Перейти в каталог</RouterLink>
        <RouterLink class="btn btn-ghost" to="/instructions">Читать инструкцию</RouterLink>
      </div>
    </div>
  </section>

  <section class="section container">
    <div class="section__head reveal">
      <h2 class="display">Как это устроено</h2>
      <p class="muted">Коротко о цикле заказа — подробности на странице инструкции.</p>
    </div>
    <ol class="steps">
      <li class="steps__item">
        <span class="steps__num">01</span>
        <div>
          <h3>Собираете корзину и оплачиваете заказ</h3>
          <p class="muted">В любое время выбираете книги, брелоки, буклеты и IP.</p>
        </div>
      </li>
      
      <li class="steps__item">
        <span class="steps__num">02</span>
        <div>
          <h3>Ожидаете сообщения от кладовщика о готовности заказа к выдаче. </h3>
          <p class="muted">
            Выдача: г. Нижний Новгород, ул. Ванеева, д. 15/34 (группа Выбор).
          </p>
        </div>
      </li>
      
    </ol>
  </section>

  <section class="section container band">
    <div class="band__copy">
      <h2 class="display">Цены закупочные</h2>
      <p class="muted">
        Сайт служит только для распространения литературы на местности. Фото и
        описания — на
        <a href="https://lit-na.ru/" target="_blank" rel="noreferrer">lit-na.ru</a>.
      </p>
    </div>
    <RouterLink class="btn btn-primary" to="/shop">Открыть витрину</RouterLink>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  min-height: calc(100svh - var(--header-h));
  display: grid;
  align-items: end;
  overflow: hidden;
  isolation: isolate;
}

.hero__visual {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    var(--hero-scrim),
    radial-gradient(ellipse 80% 60% at 70% 40%, var(--hero-glow), transparent 60%);
}

.hero__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--hero-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--hero-grid) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(circle at 70% 35%, black, transparent 70%);
  animation: pulse-line 6s ease-in-out infinite;
}

.hero__book {
  position: absolute;
  border-radius: 4px 14px 14px 4px;
  border: 1px solid var(--book-border);
  background: var(--book-fill);
  box-shadow: var(--book-shadow);
  animation: drift 12s ease-in-out infinite alternate;
}

.hero__book--a {
  width: min(38vw, 280px);
  height: min(52vw, 380px);
  right: 12%;
  top: 14%;
  transform: rotate(-8deg);
}

.hero__book--b {
  width: min(30vw, 220px);
  height: min(44vw, 320px);
  right: 28%;
  top: 22%;
  opacity: 0.85;
  animation-delay: -3s;
  transform: rotate(6deg);
}

.hero__book--c {
  width: min(22vw, 160px);
  height: min(34vw, 240px);
  right: 6%;
  top: 38%;
  opacity: 0.7;
  animation-delay: -6s;
  transform: rotate(14deg);
}

.hero__leaf {
  position: absolute;
  width: min(55vw, 420px);
  height: min(55vw, 420px);
  right: -5%;
  bottom: -10%;
  border-radius: 60% 40% 55% 45%;
  background: radial-gradient(circle at 30% 30%, var(--hero-leaf), transparent 65%);
  filter: blur(2px);
}

.hero__content {
  padding: 4.5rem 0 4rem;
  max-width: 720px;
  margin-left: max(1rem, calc((100% - 1120px) / 2 + 1rem));
  margin-right: auto;
  width: auto;
}

.hero__brand {
  margin: 0 0 1rem;
  font-size: clamp(2.4rem, 8vw, 4.6rem);
  color: var(--green-soft);
}

.hero__title {
  margin: 0 0 1rem;
  font-size: clamp(1.45rem, 3.4vw, 2.2rem);
  font-weight: 500;
  max-width: 16ch;
}

.hero__lead {
  margin: 0 0 1.8rem;
  max-width: 38ch;
  font-size: 1.05rem;
}

.hero__cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.section {
  padding: 4.5rem 0 1rem;
}

.section__head {
  margin-bottom: 2rem;
  max-width: 36rem;
}

.section__head h2 {
  margin: 0 0 0.5rem;
  font-size: clamp(1.5rem, 3vw, 2rem);
}

.section__head p {
  margin: 0;
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1.25rem;
}

.steps__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  padding: 1.2rem 0;
  border-top: 1px solid var(--line);
}

.steps__item:last-child {
  border-bottom: 1px solid var(--line);
}

.steps__num {
  font-family: var(--font-display);
  color: var(--green);
  font-size: 1.1rem;
  padding-top: 0.15rem;
}

.steps__item h3 {
  margin: 0 0 0.35rem;
  font-size: 1.1rem;
}

.steps__item p {
  margin: 0;
}

.band {
  margin: 3rem auto 1rem;
  padding: 2rem 0 3rem;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  border-top: 1px solid var(--line);
}

.band__copy {
  max-width: 36rem;
}

.band h2 {
  margin: 0 0 0.5rem;
  font-size: 1.6rem;
}

.band p {
  margin: 0;
}

@media (max-width: 720px) {
  .hero__book--b,
  .hero__book--c {
    display: none;
  }

  .hero__content {
    margin-left: 1rem;
    padding-top: 3rem;
  }
}
</style>
