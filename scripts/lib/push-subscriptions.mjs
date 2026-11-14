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

function rowChannel(row) {
  if (row?.channel === 'fcm') return 'fcm'
  if (String(row?.endpoint || '').startsWith('fcm:')) return 'fcm'
  return 'web'
}

function fcmEndpoint(token) {
  return `fcm:${String(token || '').trim()}`
}

function extractFcmToken(input) {
  const direct = String(input?.token || input?.fcmToken || '').trim()
  if (direct) return direct
  const endpoint = subscriptionEndpoint(input)
  if (endpoint.startsWith('fcm:')) return endpoint.slice(4).trim()
  return ''
}

function toWebPushSubscription(row) {
  if (rowChannel(row) !== 'web') return null
  const keys = normalizeKeys(row)
  const endpoint = subscriptionEndpoint(row)
  if (!endpoint || !keys) return null
  return { endpoint, keys, id: row.id }
}

/**
 * Save or update an admin browser / FCM push subscription.
 */
export async function upsertAdminPushSubscription(subscription) {
  const channel =
    String(subscription?.channel || '').trim() === 'fcm' || extractFcmToken(subscription)
      ? 'fcm'
      : 'web'

  if (channel === 'fcm') {
    const token = extractFcmToken(subscription)
    if (!token) {
      const error = new Error('Некорректный FCM-токен')
      error.status = 400
      throw error
    }
    const endpoint = fcmEndpoint(token)
    const store = await readStore()
    const now = new Date().toISOString()
    const index = store.subscriptions.findIndex((row) => row.endpoint === endpoint)
    const row = {
      id: index >= 0 ? store.subscriptions[index].id : randomUUID(),
      audience: 'admin',
      channel: 'fcm',
      endpoint,
      token,
      createdAt: index >= 0 ? store.subscriptions[index].createdAt : now,
      updatedAt: now,
    }
    if (index >= 0) store.subscriptions[index] = row
    else store.subscriptions.push(row)
    await writeStore(store)
    return row
  }

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
    channel: 'web',
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
 * Save or update a browser / FCM push subscription for a MoySklad counterparty.
 */
export async function upsertPushSubscription({
  counterpartyId,
  counterpartyName = '',
  subscription,
}) {
  const cpId = String(counterpartyId || '').trim()
  if (!cpId) {
    const error = new Error('Не указан контрагент')
    error.status = 400
    throw error
  }

  const channel =
    String(subscription?.channel || '').trim() === 'fcm' || extractFcmToken(subscription)
      ? 'fcm'
      : 'web'

  if (channel === 'fcm') {
    const token = extractFcmToken(subscription)
    if (!token) {
      const error = new Error('Некорректный FCM-токен')
      error.status = 400
      throw error
    }
    const endpoint = fcmEndpoint(token)
    const store = await readStore()
    const now = new Date().toISOString()
    const index = store.subscriptions.findIndex((row) => row.endpoint === endpoint)
    const row = {
      id: index >= 0 ? store.subscriptions[index].id : randomUUID(),
      audience: 'customer',
      channel: 'fcm',
      counterpartyId: cpId,
      counterpartyName: String(counterpartyName || '').trim(),
      endpoint,
      token,
      createdAt: index >= 0 ? store.subscriptions[index].createdAt : now,
      updatedAt: now,
    }
    if (index >= 0) store.subscriptions[index] = row
    else store.subscriptions.push(row)
    await writeStore(store)
    return row
  }

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
    audience: 'customer',
    channel: 'web',
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

export async function removePushSubscriptionByToken(token) {
  const normalized = String(token || '').trim()
  if (!normalized) return 0
  return removePushSubscription(fcmEndpoint(normalized))
}

export async function listAdminPushSubscriptions() {
  const store = await readStore()
  return store.subscriptions
    .filter((row) => rowAudience(row) === 'admin')
    .map((row) => toWebPushSubscription(row))
    .filter(Boolean)
}

export async function listAdminFcmTokens() {
  const store = await readStore()
  return store.subscriptions
    .filter((row) => rowAudience(row) === 'admin' && rowChannel(row) === 'fcm')
    .map((row) => String(row.token || extractFcmToken(row) || '').trim())
    .filter(Boolean)
}

export async function listPushSubscriptionsForCounterparty(counterpartyId) {
  const cpId = String(counterpartyId || '').trim()
  if (!cpId) return []
  const store = await readStore()
  return store.subscriptions
    .filter((row) => rowAudience(row) === 'customer' && row.counterpartyId === cpId)
    .map((row) => {
      const web = toWebPushSubscription(row)
      if (web) return web
      if (rowChannel(row) === 'fcm') {
        const token = String(row.token || extractFcmToken(row) || '').trim()
        if (!token) return null
        return { channel: 'fcm', token, id: row.id, endpoint: row.endpoint }
      }
      return null
    })
    .filter(Boolean)
}

export async function listCustomerFcmTokens(counterpartyId) {
  const rows = await listPushSubscriptionsForCounterparty(counterpartyId)
  return rows
    .filter((row) => row.channel === 'fcm' || row.token)
    .map((row) => String(row.token || '').trim())
    .filter(Boolean)
}

export async function removePushSubscriptionById(id) {
  const store = await readStore()
  const next = store.subscriptions.filter((row) => row.id !== id)
  store.subscriptions = next
  await writeStore(store)
}
