const STORAGE_KEY = 'litcom52-counterparty'

/** @returns {{ id: string, name: string } | null} */
export function getSavedCounterparty() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const id = String(parsed?.id || '').trim()
    const name = String(parsed?.name || '').trim()
    if (!id || !name) return null
    return { id, name }
  } catch {
    return null
  }
}

/** @param {{ id: string, name: string }} counterparty */
export function saveCounterparty(counterparty) {
  if (typeof window === 'undefined') return
  const id = String(counterparty?.id || '').trim()
  const name = String(counterparty?.name || '').trim()
  if (!id || !name) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }))
}

export function clearSavedCounterparty() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
