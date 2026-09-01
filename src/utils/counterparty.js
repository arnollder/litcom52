import { ref } from 'vue'

const STORAGE_KEY = 'litcom52-counterparty'

/** @type {import('vue').Ref<{ id: string, name: string } | null> | null} */
let savedCounterpartyRef = null

function readFromStorage() {
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

function getRef() {
  if (!savedCounterpartyRef) {
    savedCounterpartyRef = ref(readFromStorage())
  }
  return savedCounterpartyRef
}

/** @returns {{ id: string, name: string } | null} */
export function getSavedCounterparty() {
  const current = getRef().value
  if (current) return current
  const stored = readFromStorage()
  if (stored) getRef().value = stored
  return stored
}

/** @returns {import('vue').Ref<{ id: string, name: string } | null>} */
export function useSavedCounterparty() {
  return getRef()
}

/** @param {{ id: string, name: string }} counterparty */
export function saveCounterparty(counterparty) {
  if (typeof window === 'undefined') return
  const id = String(counterparty?.id || '').trim()
  const name = String(counterparty?.name || '').trim()
  if (!id || !name) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }))
  getRef().value = { id, name }
}

export function clearSavedCounterparty() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
  getRef().value = null
}
