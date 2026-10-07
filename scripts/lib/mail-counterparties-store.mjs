#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadEnvFromFile } from './moysklad-env.mjs'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '../..')
const STORE_PATH = resolve(ROOT_DIR, 'data', 'mail-counterparties.json')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function emptyStore() {
  return { version: 1, emails: [] }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeName(value) {
  return String(value || '').trim()
}

function isValidEmail(value) {
  return EMAIL_RE.test(value)
}

function normalizeItem(item = {}) {
  return {
    id: String(item.id || randomUUID()),
    email: normalizeEmail(item.email),
    name: normalizeName(item.name),
    createdAt: item.createdAt || new Date().toISOString(),
  }
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
    if (!Array.isArray(parsed?.emails)) return emptyStore()
    return {
      version: 1,
      emails: parsed.emails.map(normalizeItem).filter((item) => item.email),
    }
  } catch {
    return emptyStore()
  }
}

async function writeStore(store) {
  await ensureStoreFile()
  const payload = {
    version: 1,
    emails: Array.isArray(store.emails) ? store.emails : [],
  }
  await writeFile(STORE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

/** Seed from MAIL_FROM_FILTER once if store is empty. */
async function maybeSeedFromEnv(store) {
  if (store.emails.length) return store
  await loadEnvFromFile()
  const seed = normalizeEmail(process.env.MAIL_FROM_FILTER || '')
  if (!seed) return store
  store.emails.push({
    id: randomUUID(),
    email: seed,
    name: '',
    createdAt: new Date().toISOString(),
  })
  await writeStore(store)
  return store
}

export async function listMailCounterparties() {
  const store = await maybeSeedFromEnv(await readStore())
  return store.emails.slice().sort((a, b) => {
    const byName = (a.name || a.email).localeCompare(b.name || b.email, 'ru')
    return byName || a.email.localeCompare(b.email, 'ru')
  })
}

/** @returns {Promise<string[]>} lowercase emails used as From filters */
export async function listMailCounterpartyFilters() {
  const list = await listMailCounterparties()
  return list.map((item) => item.email)
}

/**
 * Pick counterparty whose email is contained in From text.
 * Longer email wins on ties (more specific).
 */
export function matchMailCounterparty(fromText, counterparties) {
  const text = String(fromText || '').toLowerCase()
  const list = Array.isArray(counterparties) ? counterparties : []
  let best = null
  for (const item of list) {
    const email = normalizeEmail(item?.email)
    if (!email || !text.includes(email)) continue
    if (!best || email.length > best.email.length) best = item
  }
  return best
}

export async function findMailCounterpartyByFrom(fromText) {
  return matchMailCounterparty(fromText, await listMailCounterparties())
}

export async function addMailCounterparty({ email: emailRaw, name: nameRaw } = {}) {
  const email = normalizeEmail(emailRaw)
  const name = normalizeName(nameRaw)

  if (!name) {
    const error = new Error('Укажи имя контрагента')
    error.status = 400
    throw error
  }
  if (!email) {
    const error = new Error('Укажи email')
    error.status = 400
    throw error
  }
  if (!isValidEmail(email)) {
    const error = new Error('Некорректный email')
    error.status = 400
    throw error
  }

  const store = await maybeSeedFromEnv(await readStore())
  if (store.emails.some((item) => item.email === email)) {
    const error = new Error('Такой email уже есть')
    error.status = 409
    throw error
  }

  const item = {
    id: randomUUID(),
    email,
    name,
    createdAt: new Date().toISOString(),
  }
  store.emails.push(item)
  await writeStore(store)
  return item
}

export async function updateMailCounterparty(id, patch = {}) {
  const store = await readStore()
  const index = store.emails.findIndex((item) => item.id === id)
  if (index < 0) return null

  const current = store.emails[index]
  let email = current.email
  let name = current.name

  if (patch.email != null) {
    email = normalizeEmail(patch.email)
    if (!email) {
      const error = new Error('Укажи email')
      error.status = 400
      throw error
    }
    if (!isValidEmail(email)) {
      const error = new Error('Некорректный email')
      error.status = 400
      throw error
    }
    if (store.emails.some((item, i) => i !== index && item.email === email)) {
      const error = new Error('Такой email уже есть')
      error.status = 409
      throw error
    }
  }

  if (patch.name != null) {
    name = normalizeName(patch.name)
    if (!name) {
      const error = new Error('Укажи имя контрагента')
      error.status = 400
      throw error
    }
  }

  const next = { ...current, email, name }
  store.emails[index] = next
  await writeStore(store)
  return next
}

export async function deleteMailCounterparty(id) {
  const store = await readStore()
  const index = store.emails.findIndex((item) => item.id === id)
  if (index < 0) return null
  const [removed] = store.emails.splice(index, 1)
  await writeStore(store)
  return removed
}
