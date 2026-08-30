#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '../..')
const STORE_PATH = resolve(ROOT_DIR, 'data', 'push-subscriptions.json')

function emptyStore() {
  return { version: 1, subscriptions: [] }
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
    if (!Array.isArray(parsed?.subscriptions)) return emptyStore()
    return { version: 1, subscriptions: parsed.subscriptions }
  } catch {
    return emptyStore()
  }
}

async function writeStore(store) {
  await ensureStoreFile()
  const payload = {
    version: 1,
    subscriptions: Array.isArray(store.subscriptions) ? store.subscriptions : [],
  }
  await writeFile(STORE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

function subscriptionEndpoint(subscription) {
  return String(subscription?.endpoint || '').trim()
}

function normalizeKeys(input) {
  const keys = input?.keys || input?.subscription?.keys || {}
  const p256dh = String(keys.p256dh || '').trim()
  const auth = String(keys.auth || '').trim()
  if (!p256dh || !auth) return null
  return { p256dh, auth }
}

function rowAudience(row) {
  if (row?.audience === 'admin' || row?.audience === 'customer') return row.audience
  return row?.counterpartyId ? 'customer' : 'admin'
}

function toWebPushSubscription(row) {
  const keys = normalizeKeys(row)
  const endpoint = subscriptionEndpoint(row)
  if (!endpoint || !keys) return null
  return { endpoint, keys }
}

/**
 * Save or update an admin browser push subscription.
 */
export async function upsertAdminPushSubscription(subscription) {
  const endpoint = subscriptionEndpoint(subscription)
  const keys = normalizeKeys(subscription)
  if (!endpoint || !keys) {
    const error = new Error('Некорректная push-подписка')
    error.status = 400
    throw error
  }

  const store = await readStore()
  const now = new Date().toISOString()
  const index = store.subscriptions.findIndex((row) => row.endpoint === endpoint)

  const row = {
    id: index >= 0 ? store.subscriptions[index].id : randomUUID(),
    audience: 'admin',
    endpoint,
    keys,
    createdAt: index >= 0 ? store.subscriptions[index].createdAt : now,
    updatedAt: now,
  }

  if (index >= 0) store.subscriptions[index] = row
  else store.subscriptions.push(row)

  await writeStore(store)
  return row
}

/**
 * Save or update a browser push subscription for a MoySklad counterparty.
 */
export async function upsertPushSubscription({
  counterpartyId,
  counterpartyName = '',
  subscription,
}) {
  const cpId = String(counterpartyId || '').trim()
  const endpoint = subscriptionEndpoint(subscription)
  const keys = normalizeKeys(subscription)
  if (!cpId) {
    const error = new Error('Не указан контрагент')
    error.status = 400
    throw error
  }
  if (!endpoint || !keys) {
    const error = new Error('Некорректная push-подписка')
    error.status = 400
    throw error
  }

  const store = await readStore()
  const now = new Date().toISOString()
  const index = store.subscriptions.findIndex((row) => row.endpoint === endpoint)

  const row = {
    id: index >= 0 ? store.subscriptions[index].id : randomUUID(),
    audience: 'customer',
    counterpartyId: cpId,
    counterpartyName: String(counterpartyName || '').trim(),
    endpoint,
    keys,
    createdAt: index >= 0 ? store.subscriptions[index].createdAt : now,
    updatedAt: now,
  }

  if (index >= 0) store.subscriptions[index] = row
  else store.subscriptions.push(row)

  await writeStore(store)
  return row
}

export async function removePushSubscription(endpoint) {
  const normalized = String(endpoint || '').trim()
  if (!normalized) {
    const error = new Error('Не указан endpoint подписки')
    error.status = 400
    throw error
  }

  const store = await readStore()
  const next = store.subscriptions.filter((row) => row.endpoint !== normalized)
  const removed = store.subscriptions.length - next.length
  store.subscriptions = next
  await writeStore(store)
  return removed
}

export async function listAdminPushSubscriptions() {
  const store = await readStore()
  return store.subscriptions
    .filter((row) => rowAudience(row) === 'admin')
    .map((row) => toWebPushSubscription(row))
    .filter(Boolean)
}

export async function listPushSubscriptionsForCounterparty(counterpartyId) {
  const cpId = String(counterpartyId || '').trim()
  if (!cpId) return []
  const store = await readStore()
  return store.subscriptions
    .filter((row) => rowAudience(row) === 'customer' && row.counterpartyId === cpId)
    .map((row) => ({ ...toWebPushSubscription(row), id: row.id }))
    .filter((row) => row.endpoint)
}

export async function removePushSubscriptionById(id) {
  const store = await readStore()
  const next = store.subscriptions.filter((row) => row.id !== id)
  store.subscriptions = next
  await writeStore(store)
}
