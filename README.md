# Литком М52 — фронтенд

Vue 3 витрина заказа литературы Сообщества АН Нижнего Новгорода
([литком на аннн.рф](https://аннн.рф/komiteti/litkom)) в чёрно-зелёной палитре.

## Стек

- Vue 3 + Vite
- Vue Router
- Pinia (корзина в `localStorage`)
- МойСклад API (каталог, контрагенты, резерв заказа)

## Запуск

```bash
npm install
npm run dev
```

Сборка: `npm run build`. Продакшен на VPS: `npm run build && npm start`.

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

Для продакшена укажите `VITE_ORDER_API_URL` на ваш API с тем же маршрутом `/api/orders/reserve`, либо используйте `npm start` (встроенный API).

## Live-остатки из МойСклад

На `/shop` остатки подтягиваются динамически:

- при открытии каталога;
- каждые 60 секунд;
- по кнопке **«Обновить остатки»**;
- сразу после успешного резерва заказа.

Endpoint: `GET /api/stock` (свободный остаток = stock − reserve).

Работает при `npm run dev` / `npm run preview` / `npm start`. Без API будут показаны остатки из `catalog.json`.

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

## Cron-синк МойСклад

На проде каталог/контрагентов можно обновлять по таймеру (каждый час):

```bash
npm run sync:moysklad:cron
```

Скрипт:

1. тянет каталог → `src/data/catalog.json`;
2. тянет контрагентов → `public/counterparties.json` и сразу в `dist/counterparties.json` (если `dist/` есть);
3. по умолчанию делает `npm run build`, чтобы обновлённый каталог попал в бандл витрины.

Переменные:

- `CRON_SYNC_REBUILD=0` — только JSON, без пересборки;
- `CRON_SYNC_LOCK_PATH` — путь к lock-файлу (по умолчанию `data/sync.lock`).

На VPS после выкладки кода:

```bash
sudo bash /opt/litcom52/deploy/install-sync-timer.sh
sudo systemctl start litcom52-sync.service   # прогон сразу
```

Проверка:

```bash
systemctl list-timers litcom52-sync.timer
journalctl -u litcom52-sync.service -n 50 --no-pager
```

## Админка заказов

Страница `/admin` — зеркало раздела «Заказы покупателей» в МойСклад.

Список загружается напрямую из API МойСклад (опрос каждые 5 секунд). Заказы, оформленные на витрине, помечаются комментарием `Заказ с сервиса Литком-М52` и бейджем «С этого сервиса».

Кнопки **Оплачен** / **Отгружен** меняют статус документа «Заказ покупателя» в МойСклад (`Оплачен` → `Отгружен`). Кнопка **Отгружен** активна только когда в МойСклад уже стоит «Оплачен».

API:

- `GET /api/admin/orders` — список заказов покупателей из МойСклад
- `PATCH /api/admin/orders/:id` — `{ "status": "paid" | "shipped" }` (`id` — id документа МойСклад)

Доступ по токену `ADMIN_TOKEN` из `.env` (ввод на странице `/admin`, хранится в `sessionStorage`).

Для продакшена на VPS:

```bash
npm run build
npm start
```

## Страницы

- `/` — главная
- `/shop` — каталог и корзина
- `/checkout` — оформление с выбором контрагента и резервом в МойСклад
- `/admin` — админка входящих заказов
