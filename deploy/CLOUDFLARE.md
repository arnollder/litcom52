# Cloudflare для litkom-m52.ru

Cloudflare проксирует трафик через свои edge-серверы — часто стабильнее с мобильных сетей, чем прямой заход на IP VPS.

## Что уже на VPS

После деплоя скрипт `deploy/setup-cloudflare-origin.sh` ставит nginx-конфиг `cloudflare-real-ip.conf` — реальный IP клиента в логах и заголовках.

## Вариант A — вручную (без API)

1. Зарегистрируйтесь на [cloudflare.com](https://dash.cloudflare.com/sign-up).
2. **Add a site** → `litkom-m52.ru` → план **Free**.
3. Cloudflare импортирует DNS. Проверьте записи:

   | Тип | Имя | Значение | Прокси |
   |-----|-----|----------|--------|
   | A | `@` | `62.113.110.31` | **Proxied** (оранжевое облако) |
   | A | `www` | `62.113.110.31` | **Proxied** |
   | A | `admin` | `62.113.110.31` | **Proxied** |
   | MX | `@` | `mx1.beget.com` (10), `mx2.beget.com` (20) | **DNS only** (серое облако) |
   | TXT | `@` | `v=spf1 redirect=beget.com` | **DNS only** |

4. **SSL/TLS** → Overview → **Full (strict)**  
   (на VPS уже есть Let's Encrypt для `litkom-m52.ru` и `admin.litkom-m52.ru`).

5. **SSL/TLS** → Edge Certificates → включить **Always Use HTTPS**.

6. **Caching** → **Cache Rules** → Create rule:
   - Name: `Bypass API`
   - When: URI Path starts with `/api`
   - Then: Cache status → **Bypass**

7. Скопируйте **nameservers** из Cloudflare (два адреса вида `*.ns.cloudflare.com`).

8. В панели **Beget** → домен `litkom-m52.ru` → DNS / NS → замените NS на Cloudflare (не A-запись, именно nameservers).

9. На VPS:

   ```bash
   bash /opt/litcom52/deploy/setup-cloudflare-origin.sh
   ```

10. Подождите 5–30 мин (распространение DNS). Проверка:

    ```bash
    curl -sI https://litkom-m52.ru/ | grep -i cf-ray
    curl -sI https://admin.litkom-m52.ru/ | grep -i cf-ray
    ```

    Заголовок `cf-ray` означает, что трафик идёт через Cloudflare.

## Вариант B — скрипт с API-токеном

1. Cloudflare → **My Profile** → **API Tokens** → Create Token  
   Шаблон: **Edit zone DNS** для `litkom-m52.ru` + право менять zone settings.

2. Локально или на VPS:

   ```bash
   CLOUDFLARE_API_TOKEN=your_token node deploy/cloudflare-setup.mjs
   ```

3. Вывод скрипта — nameservers для Beget.

4. На VPS:

   ```bash
   bash /opt/litcom52/deploy/setup-cloudflare-origin.sh
   ```

5. Вручную добавьте Cache Rule для `/api` (см. шаг 6 в варианте A).

## Важно

- **Не добавляйте AAAA** (IPv6), пока у VPS нет рабочего IPv6.
- **Не включайте** «Under Attack Mode» без необходимости — мешает checkout.
- Certbot на VPS продолжит работать (HTTP-01 через прокси Cloudflare).
- Push-уведомления и Web Push работают через Cloudflare на Free-плане.

## Откат

В Beget верните nameservers Beget (`ns1.beget.com`, `ns2.beget.com`, …). A-запись `@` → `62.113.110.31`.
