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

export async function fetchAdminPurchases() {
  const response = await fetch(`${getApiBase()}/api/admin/purchases`, {
    method: 'GET',
    headers: adminHeaders(),
    cache: 'no-store',
  })
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось загрузить закупки (${response.status})`)
    error.status = response.status
    throw error
  }
  return {
    purchases: Array.isArray(data.purchases) ? data.purchases : [],
    count: data.count || 0,
  }
}

export async function fetchAdminPurchase(id) {
  const response = await fetch(
    `${getApiBase()}/api/admin/purchases/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      headers: adminHeaders(),
      cache: 'no-store',
    },
  )
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось загрузить закупку (${response.status})`)
    error.status = response.status
    throw error
  }
  if (!data.purchase?.id) {
    const error = new Error('Сервер не вернул закупку')
    error.status = 502
    throw error
  }
  return data.purchase
}

export async function fetchAdminPurchaseHistory() {
  const response = await fetch(`${getApiBase()}/api/admin/purchases/history`, {
    method: 'GET',
    headers: adminHeaders(),
    cache: 'no-store',
  })
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось загрузить историю МС (${response.status})`)
    error.status = response.status
    throw error
  }
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    count: data.count || 0,
    href: data.href || 'https://online.moysklad.ru/app/#purchaseorder',
  }
}

export async function fetchAdminPurchaseHistoryOrder(id) {
  const response = await fetch(
    `${getApiBase()}/api/admin/purchases/history/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      headers: adminHeaders(),
      cache: 'no-store',
    },
  )
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось открыть накладную (${response.status})`)
    error.status = response.status
    throw error
  }
  return data.order
}

export async function fetchAdminPurchaseMailInbox() {
  const response = await fetch(`${getApiBase()}/api/admin/purchases/mail-inbox`, {
    method: 'GET',
    headers: adminHeaders(),
    cache: 'no-store',
  })
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось загрузить почтовый кэш (${response.status})`)
    error.status = response.status
    throw error
  }
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    count: data.count || 0,
    source: data.source || 'cache',
  }
}

export async function checkAdminPurchaseMail() {
  const response = await fetch(`${getApiBase()}/api/admin/purchases/check-mail`, {
    method: 'POST',
    headers: adminHeaders(),
  })
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось проверить почту (${response.status})`)
    error.status = response.status
    throw error
  }
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    count: data.count || 0,
    added: data.added || 0,
    scanned: data.scanned || 0,
    matched: data.matched || 0,
    skippedKnown: data.skippedKnown || 0,
    fromFilters: Array.isArray(data.fromFilters) ? data.fromFilters : [],
    source: data.source || 'sync',
  }
}

export async function fetchAdminMailCounterparties() {
  const response = await fetch(`${getApiBase()}/api/admin/purchases/counterparties`, {
    headers: adminHeaders(),
  })
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось загрузить контрагентов (${response.status})`)
    error.status = response.status
    throw error
  }
  return {
    emails: Array.isArray(data.emails) ? data.emails : [],
    count: data.count || 0,
    mailbox: data.mailbox || '',
  }
}

export async function addAdminMailCounterparty({ email, name }) {
  const response = await fetch(`${getApiBase()}/api/admin/purchases/counterparties`, {
    method: 'POST',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json;charset=utf-8',
    },
    body: JSON.stringify({ email, name }),
  })
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось добавить контрагента (${response.status})`)
    error.status = response.status
    throw error
  }
  return data.email
}

export async function updateAdminMailCounterparty(id, { email, name }) {
  const response = await fetch(
    `${getApiBase()}/api/admin/purchases/counterparties/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json;charset=utf-8',
      },
      body: JSON.stringify({ email, name }),
    },
  )
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось обновить контрагента (${response.status})`)
    error.status = response.status
    throw error
  }
  return data.email
}

export async function deleteAdminMailCounterparty(id) {
  const response = await fetch(
    `${getApiBase()}/api/admin/purchases/counterparties/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: adminHeaders(),
    },
  )
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось удалить контрагента (${response.status})`)
    error.status = response.status
    throw error
  }
  return data.email
}

export async function parseAdminPurchasePdf(file) {
  const form = new FormData()
  form.append('pdf', file, file.name || 'invoice.pdf')

  const token = getAdminToken()
  const response = await fetch(`${getApiBase()}/api/admin/purchases/parse`, {
    method: 'POST',
    headers: {
      Accept: 'application/json;charset=utf-8',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  })
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось разобрать PDF (${response.status})`)
    error.status = response.status
    throw error
  }
  return data.parsed
}

export async function createAdminPurchase(parsed) {
  const response = await fetch(`${getApiBase()}/api/admin/purchases`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ parsed }),
  })
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось сохранить закупку (${response.status})`)
    error.status = response.status
    throw error
  }
  return data.purchase
}

export async function createAdminPurchaseOrder(id) {
  const response = await fetch(
    `${getApiBase()}/api/admin/purchases/${encodeURIComponent(id)}/create-order`,
    {
      method: 'POST',
      headers: adminHeaders(),
    },
  )
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось создать заказ поставщику (${response.status})`)
    error.status = response.status
    throw error
  }
  if (!data.purchase?.id) {
    const error = new Error('Сервер не вернул обновлённую закупку после создания заказа')
    error.status = 502
    throw error
  }
  if (!data.purchase?.moysklad?.purchaseOrderId) {
    const error = new Error('Заказ создан в МС, но локальная закупка без purchaseOrderId')
    error.status = 502
    throw error
  }
  return {
    purchase: data.purchase,
    warning: data.warning || '',
  }
}

export async function updateAdminPurchaseChecklist(id, lines) {
  const response = await fetch(
    `${getApiBase()}/api/admin/purchases/${encodeURIComponent(id)}/checklist`,
    {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ lines }),
    },
  )
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось обновить чек-лист (${response.status})`)
    error.status = response.status
    throw error
  }
  return data.purchase
}

export async function acceptAdminPurchase(id) {
  const response = await fetch(
    `${getApiBase()}/api/admin/purchases/${encodeURIComponent(id)}/accept`,
    {
      method: 'POST',
      headers: adminHeaders(),
    },
  )
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось создать приёмку (${response.status})`)
    error.status = response.status
    throw error
  }
  return {
    purchase: data.purchase,
    warning: data.warning || '',
  }
}

export async function deleteAdminPurchase(id) {
  const response = await fetch(
    `${getApiBase()}/api/admin/purchases/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: adminHeaders(),
    },
  )
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || `Не удалось удалить закупку (${response.status})`)
    error.status = response.status
    throw error
  }
  return data.purchase
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
