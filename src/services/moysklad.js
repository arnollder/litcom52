function getApiBase() {
  const configured = import.meta.env.VITE_ORDER_API_URL
  if (configured) return configured.replace(/\/+$/, '')
  return ''
}

const TOKEN_KEY = 'litcom52-admin-token'

function readStorage(storage) {
  try {
    return storage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function writeStorage(storage, value) {
  try {
    storage.setItem(TOKEN_KEY, value)
  } catch {
    // Private mode / quota — ignore.
  }
}

function removeStorage(storage) {
  try {
    storage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

/** Session first (current login), then remembered localStorage (installed admin app). */
export function getAdminToken() {
  if (typeof window === 'undefined') return ''
  return readStorage(sessionStorage) || readStorage(localStorage)
}

/** Keep the token for this tab until the server confirms it. */
export function setAdminToken(token) {
  if (typeof window === 'undefined') return
  writeStorage(sessionStorage, String(token || '').trim())
}

/** Persist after a successful admin API call so the installed PWA stays signed in. */
export function persistAdminToken() {
  if (typeof window === 'undefined') return
  const token = getAdminToken()
  if (!token) return
  writeStorage(sessionStorage, token)
  writeStorage(localStorage, token)
}

export function clearAdminToken() {
  if (typeof window === 'undefined') return
  removeStorage(sessionStorage)
  removeStorage(localStorage)
}

function adminHeaders() {
  const token = getAdminToken()
  return {
    Accept: 'application/json;charset=utf-8',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function parseJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
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
 * @param {{
 *   counterpartyId: string,
 *   counterpartyName?: string,
 *   items: Array<{ id: string|number, qty: number, price: number, name: string }>,
 *   comment?: string,
 *   customer?: object,
 *   total?: number,
 *   createdAt?: string,
 * }} payload
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
      counterpartyName: payload.counterpartyName,
      comment: payload.comment,
      customer: payload.customer,
      total: payload.total,
      createdAt: payload.createdAt,
      items: (payload.items || []).map((item) => ({
        id: String(item.id),
        qty: Number(item.qty),
        price: Number(item.price),
        name: item.name,
      })),
    }),
  })

  const data = await parseJson(response)

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

  const data = await parseJson(response)

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Не удалось загрузить остатки (${response.status})`)
  }

  return {
    updatedAt: data.updatedAt,
    stockById: data.stockById || {},
    count: data.count || 0,
  }
}

export async function fetchAdminOrders() {
  const response = await fetch(`${getApiBase()}/api/admin/orders`, {
    method: 'GET',
    headers: adminHeaders(),
    cache: 'no-store',
  })

  const data = await parseJson(response)

  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось загрузить заказы (${response.status})`)
    error.status = response.status
    throw error
  }

  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    count: data.count || 0,
    newCount: data.newCount || 0,
  }
}

export async function updateAdminOrderStatus(id, status) {
  const response = await fetch(`${getApiBase()}/api/admin/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify({ status }),
  })

  const data = await parseJson(response)

  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось обновить заказ (${response.status})`)
    error.status = response.status
    throw error
  }

  return data.order
}

export async function fetchAdminReports({ fromDate = '', toDate = '' } = {}) {
  const url = new URL(`${getApiBase()}/api/admin/reports`, window.location.origin)
  if (fromDate) url.searchParams.set('fromDate', fromDate)
  if (toDate) url.searchParams.set('toDate', toDate)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: adminHeaders(),
    cache: 'no-store',
  })

  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось загрузить отчеты (${response.status})`)
    error.status = response.status
    throw error
  }

  return {
    soldShipped: Number(data?.metrics?.soldShipped) || 0,
    purchasedSupplies: Number(data?.metrics?.purchasedSupplies) || 0,
    stockTotal: Number(data?.metrics?.stockTotal) || 0,
  }
}
