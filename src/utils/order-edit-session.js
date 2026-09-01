import { computed, ref } from 'vue'

const SESSION_KEY = 'litcom52-edit-order'

/** @typedef {{ id: string, name: string, price: number, qty: number }} OrderLine */

const sessionState = ref(null)

/** Sync in-memory session from sessionStorage (same tab). */
export function syncOrderEditSession() {
  sessionState.value = readOrderEditSession()
  return sessionState.value
}

export function useOrderEditSession() {
  return {
    session: computed(() => sessionState.value),
    isAppendMode: computed(() => Boolean(sessionState.value)),
  }
}

/**
 * @param {{ orderId: string, orderName?: string, counterpartyId: string, items: OrderLine[] }} payload
 */
export function saveOrderEditSession(payload) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        orderId: String(payload.orderId || ''),
        orderName: String(payload.orderName || ''),
        counterpartyId: String(payload.counterpartyId || ''),
        items: Array.isArray(payload.items) ? payload.items : [],
      }),
    )
    syncOrderEditSession()
  } catch {
    // ignore quota / private mode
  }
}

/** @returns {{ orderId: string, orderName: string, counterpartyId: string, items: OrderLine[] } | null} */
export function readOrderEditSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const orderId = String(parsed?.orderId || '').trim()
    const counterpartyId = String(parsed?.counterpartyId || '').trim()
    if (!orderId || !counterpartyId) return null
    return {
      orderId,
      orderName: String(parsed?.orderName || ''),
      counterpartyId,
      items: Array.isArray(parsed?.items) ? parsed.items : [],
    }
  } catch {
    return null
  }
}

export function clearOrderEditSession() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(SESSION_KEY)
    sessionState.value = null
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  syncOrderEditSession()
}

/**
 * Merge base order lines with cart lines (sum qty by product id).
 * @param {OrderLine[]} base
 * @param {OrderLine[]} additions
 */
export function mergeOrderItems(base, additions) {
  const map = new Map()
  for (const item of base || []) {
    const id = String(item?.id || '').trim()
    const qty = Number(item?.qty) || 0
    if (!id || qty <= 0) continue
    map.set(id, {
      id,
      name: item.name || '',
      price: Number(item.price) || 0,
      qty,
    })
  }
  for (const item of additions || []) {
    const id = String(item?.id || '').trim()
    const qty = Number(item?.qty) || 0
    if (!id || qty <= 0) continue
    const row = map.get(id)
    if (row) {
      row.qty += qty
    } else {
      map.set(id, {
        id,
        name: item.name || '',
        price: Number(item.price) || 0,
        qty,
      })
    }
  }
  return [...map.values()]
}
