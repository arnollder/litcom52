function getApiBase() {
  const configured = import.meta.env.VITE_ORDER_API_URL
  if (configured) return configured.replace(/\/+$/, '')
  return ''
}

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

/**
 * Creates a MoySklad customer order and reserves cart lines.
 * @param {{ counterpartyId: string, items: Array<{ id: string|number, qty: number, price: number, name: string }>, comment?: string }} payload
 */
export async function reserveOrderInMoySklad(payload) {
  const response = await fetch(`${getApiBase()}/api/orders/reserve`, {
    method: 'POST',
    headers: {
      Accept: 'application/json;charset=utf-8',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      counterpartyId: payload.counterpartyId,
      comment: payload.comment,
      items: (payload.items || []).map((item) => ({
        id: String(item.id),
        qty: Number(item.qty),
        price: Number(item.price),
        name: item.name,
      })),
    }),
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Не удалось зарезервировать заказ (${response.status})`)
  }

  return data.order
}

/**
 * Fetches live free stock map from MoySklad via local/API middleware.
 */
export async function fetchLiveStock() {
  const response = await fetch(`${getApiBase()}/api/stock`, {
    method: 'GET',
    headers: {
      Accept: 'application/json;charset=utf-8',
    },
    cache: 'no-store',
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Не удалось загрузить остатки (${response.status})`)
  }

  return {
    updatedAt: data.updatedAt,
    stockById: data.stockById || {},
    count: data.count || 0,
  }
}
