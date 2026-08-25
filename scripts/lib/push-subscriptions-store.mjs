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

function normalizeSubscription(input) {
  const endpoint = String(input?.endpoint || '').trim()
  const keys = input?.keys || {}
  const p256dh = String(keys.p256dh || '').trim()
  const auth = String(keys.auth || '').trim()
  if (!endpoint || !p256dh || !auth) {
    const error = new Error('Некорректная push-подписка')
    error.status = 400
    throw error
  }
  return { endpoint, keys: { p256dh, auth } }
}

export async function listPushSubscriptions() {
  const store = await readStore()
  return store.subscriptions
}

export async function upsertPushSubscription(input) {
  const next = normalizeSubscription(input)
  const store = await readStore()
  const index = store.subscriptions.findIndex((item) => item.endpoint === next.endpoint)
  const row = {
    id: index >= 0 ? store.subscriptions[index].id : randomUUID(),
    ...next,
    updatedAt: new Date().toISOString(),
    createdAt: index >= 0 ? store.subscriptions[index].createdAt : new Date().toISOString(),
  }
  if (index >= 0) store.subscriptions[index] = row
  else store.subscriptions.push(row)
  await writeStore(store)
  return row
}

export async function removePushSubscription(input) {
  const endpoint = String(input?.endpoint || '').trim()
  if (!endpoint) {
    const error = new Error('Не указан endpoint подписки')
    error.status = 400
    throw error
  }
  const store = await readStore()
  const before = store.subscriptions.length
  store.subscriptions = store.subscriptions.filter((item) => item.endpoint !== endpoint)
  if (store.subscriptions.length === before) {
    const error = new Error('Подписка не найдена')
    error.status = 404
    throw error
  }
  await writeStore(store)
  return { removed: true }
}

export async function removePushSubscriptionByEndpoint(endpoint) {
  const store = await readStore()
  store.subscriptions = store.subscriptions.filter((item) => item.endpoint !== endpoint)
  await writeStore(store)
}
