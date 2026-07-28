# Литком ЕКБ — фронтенд

Vue 3 витрина заказа литературы по мотивам [litcom-ekb.ru](https://litcom-ekb.ru/) в чёрно-зелёной палитре.

**Сайт:** https://arnollder.github.io/litcom52/

## Стек

- Vue 3 + Vite
- Vue Router
- Pinia (корзина в `localStorage`)
- GitHub Pages (Actions)
- МойСклад API (каталог, контрагенты, резерв заказа)

## Запуск

```bash
npm install
npm run dev
```

Сборка: `npm run build` (base path `/litcom52/` для Pages).

## Контрагенты в checkout из МойСклад

В форме `/checkout` выбирается контрагент МойСклад (radio + выпадающий список).

Список контрагентов загружается из `public/counterparties.json`, который обновляется скриптом:

```bash
npm run sync:moysklad:counterparties
```

После синхронизации перезапустите `npm run dev`.

## Резерв заказа в МойСклад

При нажатии **«Отправить заказ»** создаётся документ «Заказ покупателя» в МойСклад, и по каждой позиции ставится `reserve = quantity`.

Это работает через серверный endpoint Vite middleware:

- `POST /api/orders/reserve`

Поэтому резерв доступен при `npm run dev` / `npm run preview` (нужны `MOYSKLAD_*` в `.env`).

На чистом GitHub Pages без backend endpoint резерв не выполнится — для продакшена укажите `VITE_ORDER_API_URL` на ваш API с тем же маршрутом `/api/orders/reserve`.

## Синхронизация каталога из МойСклад

1. Скопируйте `.env.example` в `.env` и укажите доступ:
   - либо `MOYSKLAD_TOKEN`,
   - либо `MOYSKLAD_LOGIN` + `MOYSKLAD_PASSWORD`.
2. Запустите:

```bash
npm run sync:moysklad
```

Скрипт обновляет `src/data/catalog.json` данными категорий и остатков из МойСклад.
В колонке «В наличии» показывается свободный остаток (`quantity` = stock − reserve), без зарезервированных позиций.

Для обновления каталога и контрагентов одним запуском:

```bash
npm run sync:moysklad:all
```

## Страницы

- `/` — главная
- `/instructions` — инструкция
- `/shop` — каталог и корзина
- `/checkout` — оформление с выбором контрагента и резервом в МойСклад
