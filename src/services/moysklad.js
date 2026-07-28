export async function fetchCounterpartiesFromMoySklad() {
  const url = new URL(`${import.meta.env.BASE_URL}counterparties.json`, window.location.origin)
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json;charset=utf-8',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    if (response.status === 404) {
      return {
        rows: [],
        warning: 'Список контрагентов не найден. Запустите sync:moysklad:counterparties.',
      }
    }
    throw new Error(`Не удалось загрузить counterparties.json (${response.status})`)
  }

  const payload = await response.json()
  const rows = Array.isArray(payload?.rows) ? payload.rows : []
  return {
    rows,
    warning: payload?.source === 'mock' ? 'Используется тестовый список контрагентов.' : '',
  }
}
