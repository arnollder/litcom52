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

Прод: [https://litkom-m52.ru/](https://litkom-m52.ru/) (`root@62.113.110.31`, каталог `/opt/litcom52`).
Админка: [https://admin.litkom-m52.ru/](https://admin.litkom-m52.ru/) (отдельный поддомен и PWA).

Стабильность с мобильных сетей: [deploy/CLOUDFLARE.md](deploy/CLOUDFLARE.md) — прокси Cloudflare (Free) + nginx real IP на VPS.

Деплой с локальной машины:

```bash
bash deploy/deploy-vps.sh
```

Автодеплой: при пуше/мерже в `master` GitHub Actions на self-hosted runner (`litkom-m52`) запускает `deploy/deploy-on-server.sh`.

Один раз на VPS после DNS `admin` A → IP сервера:

```bash
ssh root@62.113.110.31 'bash /opt/litcom52/deploy/setup-admin-vhost.sh'
```

Установка runner на VPS (один раз):

```bash
TOKEN=$(gh api -X POST repos/arnollder/litcom52/actions/runners/registration-token --jq .token)
ssh root@62.113.110.31 "REGISTRATION_TOKEN=$TOKEN bash -s" < deploy/install-github-runner.sh
```


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

## Push-уведомления при отгрузке

На checkout пользователь **сохраняет контрагента** (в `localStorage`). После выбора можно включить push — подписка привязывается к `counterpartyId`.

Когда в админке заказ переводят в **«Отгружен»**, сервер шлёт push только подписчикам с тем же контрагентом.

Настройка на VPS (один раз):

```bash
npm run generate:vapid
# добавить VAPID_* в /opt/litcom52/.env
systemctl restart litcom52
```

API:

- `GET /api/push/vapid-public-key`
- `POST /api/push/subscribe` — `{ counterpartyId, counterpartyName, subscription }`
- `DELETE /api/push/subscribe` — `{ endpoint }`

## История заказов покупателя

Страница `/orders` — список заказов сохранённого контрагента (`litcom52-counterparty` в localStorage).
Редактирование позиций доступно только для заказов в статусе **«Новый»**.

API:

- `GET /api/orders?counterpartyId=...` — список заказов контрагента
- `GET /api/orders/:id?counterpartyId=...` — один заказ
- `PATCH /api/orders/:id` — `{ counterpartyId, items: [{ id, qty, price, name }] }` (только «Новый»)

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

Прод-URL: [https://admin.litkom-m52.ru/](https://admin.litkom-m52.ru/).
На основном домене `/admin` редиректит на поддомен. Отдельный PWA-манифест — можно установить админку рядом с магазином.

Страница — зеркало раздела «Заказы покупателей» в МойСклад.

Список загружается напрямую из API МойСклад (опрос каждые 5 секунд). Заказы, оформленные на витрине, помечаются комментарием `Заказ с сервиса Литком-М52` и бейджем «С этого сервиса».

Кнопки **Оплачен** / **Отгружен** меняют статус документа «Заказ покупателя» в МойСклад (`Оплачен` → `Отгружен`). Кнопка **Отгружен** активна только когда в МойСклад уже стоит «Оплачен». **Откатить** возвращает на шаг назад (`Отгружен` → `Оплачен`, `Оплачен` → `Новый`).

API:

- `GET /api/admin/orders` — список заказов покупателей из МойСклад
- `PATCH /api/admin/orders/:id` — `{ "status": "new" | "paid" | "shipped" }` (`id` — id документа МойСклад)

Доступ по токену `ADMIN_TOKEN` из `.env` (ввод на странице админки). После успешного входа токен сохраняется в `localStorage`, чтобы установленная PWA админки не спрашивала его снова; «Выйти» очищает память.

Для продакшена на VPS:

```bash
npm run build
npm start
```

## Страницы

- `/` — главная
- `/shop` — каталог и корзина
- `/checkout` — оформление с выбором контрагента и резервом в МойСклад
- `https://admin.litkom-m52.ru/` — админка входящих заказов
