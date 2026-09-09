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

/**
 * Loads storefront catalog from static JSON (not bundled).
 */
export async function fetchCatalog() {
  const url = new URL(`${import.meta.env.BASE_URL}catalog.json`, window.location.origin)
  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json;charset=utf-8' },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Не удалось загрузить каталог (${response.status})`)
  }
  const payload = await response.json()
  return {
    categories: Array.isArray(payload?.categories) ? payload.categories : [],
    starterSet: payload?.starterSet || [],
  }
}

/**
 * Resolves a group by storefront token (server-side mapping).
 * @param {string} token
 */
export async function resolveCounterpartyByToken(token) {
  const response = await fetch(`${getApiBase()}/api/counterparty/resolve`, {
    method: 'POST',
    headers: {
      Accept: 'application/json;charset=utf-8',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: String(token || '').trim() }),
  })

  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Неверный токен (${response.status})`)
  }

  return {
    id: String(data.counterparty?.id || ''),
    name: String(data.counterparty?.name || ''),
    contact: String(data.counterparty?.contact || ''),
  }
}

/**
 * Creates a MoySklad customer order and reserves cart lines.
 * @param {{
 *   token: string,
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
      token: payload.token,
      comment: payload.comment,
      customer: payload.customer,
      total: payload.total,
      createdAt: payload.createdAt,
      items: (payload.items || []).map((item) => ({
        id: String(item.id),
        qty: Number(item.qty),
        price: Number(item.price),
        name: item.name,
        type: item.type || item.assortmentType || '',
      })),
    }),
  })

  const data = await parseJson(response)

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Не удалось зарезервировать заказ (${response.status})`)
  }

  return {
    order: data.order,
    counterparty: data.counterparty || null,
    payment: data.payment || null,
  }
}

export async function fetchLiveStock({ etag = '' } = {}) {
  const response = await fetch(`${getApiBase()}/api/stock`, {
    method: 'GET',
    headers: {
      Accept: 'application/json;charset=utf-8',
      ...(etag ? { 'If-None-Match': etag } : {}),
    },
    cache: 'no-store',
  })

  if (response.status === 304) {
    return {
      notModified: true,
      etag: response.headers.get('etag') || etag,
      updatedAt: null,
      stockById: null,
      count: 0,
    }
  }

  const data = await parseJson(response)

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Не удалось загрузить остатки (${response.status})`)
  }

  return {
    notModified: false,
    updatedAt: data.updatedAt,
    stockById: data.stockById || {},
    count: data.count || 0,
    etag: response.headers.get('etag') || data.etag || '',
  }
}

export async function fetchCustomerOrders(token) {
  const url = new URL(`${getApiBase()}/api/orders`, window.location.origin)
  url.searchParams.set('token', String(token || '').trim())

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json;charset=utf-8' },
    cache: 'no-store',
  })

  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Не удалось загрузить заказы (${response.status})`)
  }

  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    count: data.count || 0,
    counterparty: data.counterparty || null,
    payment: data.payment || null,
  }
}

export async function updateCustomerOrder(orderId, { token, items }) {
  const response = await fetch(`${getApiBase()}/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json;charset=utf-8',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token,
      items: (items || []).map((item) => ({
        id: String(item.id),
        qty: Number(item.qty),
        price: Number(item.price),
        name: item.name,
        type: item.type || item.assortmentType || '',
      })),
    }),
  })

  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Не удалось сохранить заказ (${response.status})`)
  }

  return data.order
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

export async function fetchPushVapidPublicKey() {
  const response = await fetch(`${getApiBase()}/api/admin/push/vapid-public-key`, {
    method: 'GET',
    headers: { Accept: 'application/json;charset=utf-8' },
    cache: 'no-store',
  })

  const data = await parseJson(response)
  if (!response.ok || !data?.ok || !data.publicKey) {
    const error = new Error(data?.error || `Push недоступен (${response.status})`)
    error.status = response.status
    throw error
  }

  return { publicKey: data.publicKey }
}

export async function subscribeAdminPush(subscription) {
  const response = await fetch(`${getApiBase()}/api/admin/push/subscribe`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ subscription }),
  })

  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось подписаться на push (${response.status})`)
    error.status = response.status
    throw error
  }

  return data
}

export async function unsubscribeAdminPush(subscription) {
  const response = await fetch(`${getApiBase()}/api/admin/push/subscribe`, {
    method: 'DELETE',
    headers: adminHeaders(),
    body: JSON.stringify({ subscription }),
  })

  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось отписаться от push (${response.status})`)
    error.status = response.status
    throw error
  }

  return data
}
