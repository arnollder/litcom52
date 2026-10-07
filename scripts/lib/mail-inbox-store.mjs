#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  listMailCounterparties,
  matchMailCounterparty,
} from './mail-counterparties-store.mjs'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '../..')
const STORE_PATH = resolve(ROOT_DIR, 'data', 'mail-inbox.json')

function emptyStore() {
  return { version: 1, items: [], processedUids: [] }
}

function makeInboxId(uid, filename) {
  return `${uid}:${String(filename || '').trim() || 'attachment.pdf'}`
}

function normalizeItem(item = {}) {
  const uid = item.mail?.uid ?? item.uid
  const filename = item.sourcePdfName || item.filename || ''
  const id = String(item.id || makeInboxId(uid, filename))
  return {
    id,
    createdAt: item.createdAt || new Date().toISOString(),
    consumedAt: item.consumedAt || null,
    purchaseId: item.purchaseId || null,
    invoiceNumber: String(item.invoiceNumber || '').trim(),
    invoiceDate: String(item.invoiceDate || '').trim(),
    supplierName: String(item.supplierName || '').trim(),
    total: item.total ?? null,
    sourcePdfName: String(item.sourcePdfName || filename || '').trim(),
    parsedAt: item.parsedAt || null,
    lines: Array.isArray(item.lines) ? item.lines : [],
    mail: {
      uid: uid != null ? Number(uid) : null,
      messageId: item.mail?.messageId || item.messageId || null,
      from: item.mail?.from || item.from || '',
      subject: item.mail?.subject || item.subject || '',
      date: item.mail?.date || item.date || null,
      counterpartyId: item.mail?.counterpartyId || null,
      counterpartyName: item.mail?.counterpartyName || '',
      counterpartyEmail: item.mail?.counterpartyEmail || '',
    },
  }
}

/**
 * Resolve live counterparty name/email onto an inbox row (id → email → From match).
 * Keeps raw RFC `mail.from` for matching only — UI should not display it.
 */
function enrichItemWithCounterparty(item, counterparties, indexes = null) {
  const current = normalizeItem(item)
  const list = Array.isArray(counterparties) ? counterparties : []
  const byId = indexes?.byId || new Map(list.map((row) => [row.id, row]))
  const byEmail = indexes?.byEmail || new Map(list.map((row) => [row.email, row]))

  let matched =
    (current.mail.counterpartyId && byId.get(current.mail.counterpartyId)) ||
    (current.mail.counterpartyEmail &&
      byEmail.get(String(current.mail.counterpartyEmail).trim().toLowerCase())) ||
    matchMailCounterparty(current.mail.from, list) ||
    null

  if (!matched) return current

  const name = String(matched.name || '').trim()
  const email = String(matched.email || '').trim()
  const nextName = name || current.mail.counterpartyName || ''
  const nextEmail = email || current.mail.counterpartyEmail || ''
  const nextSupplier = name || current.supplierName || ''

  if (
    nextName === current.mail.counterpartyName &&
    nextEmail === current.mail.counterpartyEmail &&
    matched.id === current.mail.counterpartyId &&
    nextSupplier === current.supplierName
  ) {
    return current
  }

  return {
    ...current,
    supplierName: nextSupplier,
    mail: {
      ...current.mail,
      counterpartyId: matched.id || current.mail.counterpartyId,
      counterpartyName: nextName,
      counterpartyEmail: nextEmail,
    },
  }
}

async function enrichStoreItems(store) {
  const counterparties = await listMailCounterparties()
  const indexes = {
    byId: new Map(counterparties.map((row) => [row.id, row])),
    byEmail: new Map(counterparties.map((row) => [row.email, row])),
  }
  let dirty = false
  const items = store.items.map((item) => {
    const next = enrichItemWithCounterparty(item, counterparties, indexes)
    if (
      next.mail.counterpartyName !== item.mail?.counterpartyName ||
      next.mail.counterpartyEmail !== item.mail?.counterpartyEmail ||
      next.mail.counterpartyId !== item.mail?.counterpartyId ||
      next.supplierName !== item.supplierName
    ) {
      dirty = true
    }
    return next
  })
  store.items = items
  return dirty
}

async function ensureStoreFile() {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  try {
    await readFile(STORE_PATH, 'utf8')
  } catch {
    await writeFile(STORE_PATH, `${JSON.stringify(emptyStore(), null, 2)}\n`, 'utf8')
  }
}

async function readStore() {
  await ensureStoreFile()
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    const parsed = raw ? JSON.parse(raw) : emptyStore()
    const items = Array.isArray(parsed?.items) ? parsed.items.map(normalizeItem) : []
    const processedUids = Array.isArray(parsed?.processedUids)
      ? parsed.processedUids.map(Number).filter((n) => Number.isFinite(n))
      : []
    return { version: 1, items, processedUids }
  } catch {
    return emptyStore()
  }
}

async function writeStore(store) {
  await ensureStoreFile()
  const payload = {
    version: 1,
    items: Array.isArray(store.items) ? store.items : [],
    processedUids: Array.isArray(store.processedUids) ? store.processedUids : [],
  }
  await writeFile(STORE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

function sortActiveNewest(a, b) {
  const da = a.mail?.date || a.createdAt || ''
  const db = b.mail?.date || b.createdAt || ''
  return String(db).localeCompare(String(da))
}

/** All known ids (active + consumed) for dedupe / skip-parse. */
export async function listKnownMailInboxIds() {
  const store = await readStore()
  return new Set(store.items.map((item) => item.id))
}

/** UIDs already fully scanned (no need to re-download). */
export async function listProcessedMailUids() {
  const store = await readStore()
  return new Set(store.processedUids)
}

/** Active (not consumed) inbox rows for the UI. */
export async function listActiveMailInbox() {
  const store = await readStore()
  const dirty = await enrichStoreItems(store)
  if (dirty) await writeStore(store)
  return store.items.filter((item) => !item.consumedAt).sort(sortActiveNewest)
}

/**
 * Merge newly parsed hits; skip duplicates by id.
 * @param {object[]} rows
 * @param {number[]} [processedUids]
 */
export async function mergeMailInboxItems(rows, processedUids = []) {
  const store = await readStore()
  const byId = new Map(store.items.map((item) => [item.id, item]))
  let added = 0

  for (const row of Array.isArray(rows) ? rows : []) {
    const next = normalizeItem({
      ...row,
      createdAt: row.createdAt || new Date().toISOString(),
      consumedAt: row.consumedAt || null,
      purchaseId: row.purchaseId || null,
    })
    if (byId.has(next.id)) continue
    byId.set(next.id, next)
    added += 1
  }

  const uidSet = new Set(store.processedUids)
  for (const uid of processedUids) {
    const n = Number(uid)
    if (Number.isFinite(n)) uidSet.add(n)
  }

  store.items = [...byId.values()].sort(sortActiveNewest)
  store.processedUids = [...uidSet].sort((a, b) => b - a).slice(0, 500)
  await enrichStoreItems(store)
  await writeStore(store)

  return {
    added,
    items: store.items.filter((item) => !item.consumedAt).sort(sortActiveNewest),
  }
}

/**
 * Mark inbox row as used after draft creation (or dismiss).
 * @param {string} id
 * @param {string|null} [purchaseId]
 */
export async function consumeMailInboxItem(id, purchaseId = null) {
  const store = await readStore()
  const index = store.items.findIndex((item) => item.id === id)
  if (index < 0) return null
  const current = store.items[index]
  if (current.consumedAt) return current
  const next = {
    ...current,
    consumedAt: new Date().toISOString(),
    purchaseId: purchaseId || current.purchaseId || null,
  }
  store.items[index] = next
  await writeStore(store)
  return next
}

export { makeInboxId }
