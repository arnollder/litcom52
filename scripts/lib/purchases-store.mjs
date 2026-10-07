#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '../..')
const PURCHASES_PATH = resolve(ROOT_DIR, 'data', 'purchases.json')

export const PURCHASE_STATUSES = new Set([
  'draft',
  'ordered',
  'partial',
  'accepted',
])

function emptyStore() {
  return { version: 1, purchases: [] }
}

async function ensureStoreFile() {
  await mkdir(dirname(PURCHASES_PATH), { recursive: true })
  try {
    await readFile(PURCHASES_PATH, 'utf8')
  } catch {
    await writeFile(PURCHASES_PATH, `${JSON.stringify(emptyStore(), null, 2)}\n`, 'utf8')
  }
}

async function readStore() {
  await ensureStoreFile()
  try {
    const raw = await readFile(PURCHASES_PATH, 'utf8')
    const parsed = raw ? JSON.parse(raw) : emptyStore()
    if (!Array.isArray(parsed?.purchases)) return emptyStore()
    return { version: 1, purchases: parsed.purchases }
  } catch {
    return emptyStore()
  }
}

async function writeStore(store) {
  await ensureStoreFile()
  const payload = {
    version: 1,
    purchases: Array.isArray(store.purchases) ? store.purchases : [],
  }
  await writeFile(PURCHASES_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

function normalizeLine(line = {}) {
  const qtyOrdered = Number(line.qtyOrdered)
  const price = Number(line.price)
  const qtyReceived =
    line.qtyReceived == null || line.qtyReceived === ''
      ? null
      : Number(line.qtyReceived)
  return {
    id: String(line.id || randomUUID()),
    name: String(line.name || '').trim(),
    article: String(line.article || '').trim(),
    qtyOrdered: Number.isFinite(qtyOrdered) && qtyOrdered > 0 ? qtyOrdered : 0,
    price: Number.isFinite(price) ? price : 0,
    weightKg:
      line.weightKg == null || line.weightKg === ''
        ? null
        : Number(line.weightKg),
    checked: Boolean(line.checked),
    qtyReceived:
      qtyReceived != null && Number.isFinite(qtyReceived) && qtyReceived >= 0
        ? qtyReceived
        : null,
    moyskladProductId: line.moyskladProductId || null,
    moyskladAssortmentHref: line.moyskladAssortmentHref || null,
    moyskladAssortmentType: line.moyskladAssortmentType || null,
    matchError: line.matchError || null,
  }
}

export function computePurchaseStatus(purchase) {
  if (purchase?.moysklad?.supplyId) {
    const lines = Array.isArray(purchase.lines) ? purchase.lines : []
    const allChecked =
      lines.length > 0 && lines.every((line) => line.checked && (line.qtyReceived ?? line.qtyOrdered) > 0)
    return allChecked ? 'accepted' : 'partial'
  }
  if (purchase?.moysklad?.purchaseOrderId) return 'ordered'
  return 'draft'
}

function withDerived(purchase) {
  const lines = Array.isArray(purchase.lines) ? purchase.lines.map(normalizeLine) : []
  const total =
    Number.isFinite(Number(purchase.total)) && Number(purchase.total) > 0
      ? Number(purchase.total)
      : lines.reduce((sum, line) => sum + line.price, 0)
  const next = {
    ...purchase,
    lines,
    total,
    status: computePurchaseStatus({ ...purchase, lines }),
  }
  return next
}

/**
 * @param {object} input
 */
export async function createPurchase(input) {
  const store = await readStore()
  const purchase = withDerived({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    invoiceNumber: String(input.invoiceNumber || '').trim(),
    invoiceDate: String(input.invoiceDate || '').trim(),
    supplierName: String(input.supplierName || 'Литература АН').trim(),
    sourcePdfName: String(input.sourcePdfName || '').trim(),
    parsedAt: input.parsedAt || new Date().toISOString(),
    status: 'draft',
    total: input.total ?? null,
    moysklad: {
      purchaseOrderId: null,
      purchaseOrderName: null,
      purchaseOrderHref: null,
      supplyId: null,
      supplyName: null,
      supplyHref: null,
      agentId: null,
    },
    lines: Array.isArray(input.lines) ? input.lines : [],
  })
  store.purchases.unshift(purchase)
  await writeStore(store)
  return purchase
}

export async function listPurchases() {
  const store = await readStore()
  return store.purchases.map(withDerived)
}

export async function getPurchaseById(id) {
  const store = await readStore()
  const found = store.purchases.find((item) => item.id === id)
  return found ? withDerived(found) : null
}

export async function deletePurchase(id) {
  const store = await readStore()
  const index = store.purchases.findIndex((item) => item.id === id)
  if (index < 0) return null
  const [removed] = store.purchases.splice(index, 1)
  await writeStore(store)
  return withDerived(removed)
}

/**
 * @param {string} id
 * @param {(purchase: object) => object} mutator
 */
export async function updatePurchase(id, mutator) {
  const store = await readStore()
  const index = store.purchases.findIndex((item) => item.id === id)
  if (index < 0) return null
  const current = withDerived(store.purchases[index])
  const next = withDerived({
    ...mutator(current),
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  })
  store.purchases[index] = next
  await writeStore(store)
  return next
}

export async function updatePurchaseChecklist(id, linesPatch) {
  return updatePurchase(id, (purchase) => {
    if (purchase.moysklad?.supplyId) {
      const error = new Error('Чек-лист нельзя менять после приёмки')
      error.status = 409
      throw error
    }
    const byId = new Map(
      (Array.isArray(linesPatch) ? linesPatch : []).map((line) => [String(line.id), line]),
    )
    const lines = purchase.lines.map((line) => {
      const patch = byId.get(line.id)
      if (!patch) return line
      return {
        ...line,
        checked: patch.checked == null ? line.checked : Boolean(patch.checked),
        qtyReceived:
          patch.qtyReceived == null || patch.qtyReceived === ''
            ? line.qtyReceived
            : Number(patch.qtyReceived),
      }
    })
    return { ...purchase, lines }
  })
}
