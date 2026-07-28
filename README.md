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

## Синхронизация каталога из МойСклад

1. Скопируйте `.env.example` в `.env` и укажите доступ:
   - либо `MOYSKLAD_TOKEN`,
   - либо `MOYSKLAD_LOGIN` + `MOYSKLAD_PASSWORD`.
2. Запустите:

```bash
npm run sync:moysklad
```

Скрипт обновляет `src/data/catalog.json` данными категорий и остатков из МойСклад.

## Страницы

- `/` — главная
- `/instructions` — инструкция
- `/shop` — каталог и корзина
- `/checkout` — оформление (демо: сохранение заказа в браузере)
