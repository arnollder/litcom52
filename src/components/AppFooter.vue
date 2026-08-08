<script setup>
const year = new Date().getFullYear()
</script>

<template>
  <footer class="footer">
    <div class="container footer__inner">
      <div>
        <div class="footer__brand display">ЛИТКОМ-M52</div>
        <p class="muted">
          Система заказа литературы Сообщества АН Нижнего Новгорода.
        </p>
      </div>
      <div class="footer__links">
        <a href="https://lit-na.ru/" target="_blank" rel="noreferrer">Магазин РЗФ</a>
        <a href="https://аннн.рф/" target="_blank" rel="noreferrer">АН Нижний Новгород</a>
        <a href="https://аннн.рф/komiteti/litkom" target="_blank" rel="noreferrer">Литком-М52</a>
      </div>
      <p class="footer__note muted">
        © {{ year }} · сайт-витрина для местности · цены без наценки
      </p>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  margin-top: auto;
  border-top: 1px solid var(--line);
  padding: 2.5rem 0 3rem;
  background: var(--inset-soft);
}

.footer__inner {
  display: grid;
  gap: 1.2rem;
}

.footer__brand {
  font-size: 1.15rem;
  margin-bottom: 0.35rem;
  color: var(--green-soft);
}

.footer__links {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.4rem;
}

.footer__note {
  font-size: 0.85rem;
  margin: 0;
}
</style>
