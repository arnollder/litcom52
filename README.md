# Литком ЕКБ — фронтенд

Vue 3 витрина заказа литературы по мотивам [litcom-ekb.ru](https://litcom-ekb.ru/) в чёрно-зелёной палитре.

**Сайт:** https://arnollder.github.io/litcom52/

## Стек

- Vue 3 + Vite
- Vue Router
- Pinia (корзина в `localStorage`)
- GitHub Pages (Actions)

## Запуск

```bash
npm install
npm run dev
```

Сборка: `npm run build` (base path `/litcom52/` для Pages).

## Контрагенты в checkout из МойСклад

В форме `/checkout` можно выбрать источник контакта:
- вручную;
- из контрагента МойСклад (radio + выпадающий список).

Список контрагентов загружается из `public/counterparties.json`, который обновляется скриптом:

```bash
npm run sync:moysklad:counterparties
```

После синхронизации перезапустите `npm run dev`.

## Синхронизация каталога из МойСклад

1. Скопируйте `.env.example` в `.env` и укажите доступ:
   - либо `MOYSKLAD_TOKEN`,
   - либо `MOYSKLAD_LOGIN` + `MOYSKLAD_PASSWORD`.
2. Запустите:

```bash
npm run sync:moysklad
```

Скрипт обновляет `src/data/catalog.json` данными категорий и остатков из МойСклад.

Для обновления каталога и контрагентов одним запуском:

```bash
npm run sync:moysklad:all
```

## Страницы

- `/` — главная
- `/instructions` — инструкция
- `/shop` — каталог и корзина
- `/checkout` — оформление (демо: сохранение заказа в браузере)
